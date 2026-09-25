#!/usr/bin/env python3
"""
Biltong Bites - Web Server & Order Management API
=================================================
This script runs a lightweight, production-ready Python HTTP server to:
1. Serve pre-rendered static assets and pages from the `_site` Eleventy build directory.
2. Provide an API backend for:
   - Order submissions (/api/orders)
   - Contact form messages (/api/contact)
   - Admin dashboard endpoints (/api/admin/data, /api/admin/orders, etc.)
3. Send transactional notification emails using standard SMTP (Gmail or custom).
4. Persist customers and orders into an SQLite database (`orders.db`).

Usage:
    python3 serve.py [port]
    (Default port: 8000)
"""

import http.server
import socketserver
import sys
import os
import sqlite3
import json
import smtplib
import base64
import re
from email.message import EmailMessage
from datetime import datetime
import hashlib
import uuid
from http import cookies
from urllib.parse import urlparse, parse_qs

# ==============================================================================
# Configuration & Constants
# ==============================================================================
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
HERE = os.path.dirname(os.path.abspath(__file__))
DIRECTORY = os.path.join(HERE, "_site")
TEMPLATES_DIR = os.path.join(HERE, "templates")
DB_PATH = os.path.join(HERE, "orders.db")
ENV_PATH = os.path.join(HERE, ".env")

# Load environment variables from .env if present
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key.strip()] = val.strip()

# ==============================================================================
# Database Initialization & Schema Setup
# ==============================================================================
def init_db():
    """Initializes the SQLite database tables for customers and orders."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create customers table (deduplicated by email)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Create orders table with foreign key to customers
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            cart TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id)
        )
    ''')

    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone TEXT DEFAULT '',
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'customer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Migration: Add phone column if it doesn't exist
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ""')
    except Exception:
        pass

    # Create sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()
    conn.close()

# ==============================================================================
# Helper Functions
# ==============================================================================
def get_template(template_name, fallback=""):
    """
    Safely retrieves a template markdown file from the templates directory,
    falling back to root directory or default text if not found.
    """
    path = os.path.join(TEMPLATES_DIR, template_name)
    if not os.path.exists(path):
        path = os.path.join(HERE, template_name)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    return fallback

def markdown_to_html(md_text):
    """Converts simple markdown text (headers, bold, lists) into clean HTML."""
    html = md_text
    html = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html)
    html = re.sub(r'^### (.*)', r'<h3>\1</h3>', html, flags=re.MULTILINE)

    lines = html.split('\n')
    in_list = False
    html_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('* ') or stripped.startswith('- '):
            if not in_list:
                html_lines.append('<ul>')
                in_list = True
            item_content = stripped[2:].strip()
            html_lines.append(f"  <li>{item_content}</li>")
        else:
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            if line.startswith('<h'):
                html_lines.append(line)
            elif stripped == '':
                html_lines.append('<br>')
            else:
                html_lines.append(line)

    if in_list:
        html_lines.append('</ul>')

    body = '\n'.join(html_lines)
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2c1e1e; }}
  h3 {{ color: #7a1b1b; margin-top: 1.5em; }}
  ul {{ padding-left: 20px; }}
  li {{ margin-bottom: 0.25em; }}
  strong {{ color: #111; }}
</style>
</head>
<body>
{body}
</body>
</html>"""

# ==============================================================================
# Request Handler
# ==============================================================================
class BiltongRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP handler serving static files and API endpoints."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def send_json(self, status_code, data):
        """Helper to send JSON response with appropriate headers."""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_cookie(self, name):
        cookie_header = self.headers.get('Cookie')
        if not cookie_header:
            return None
        c = cookies.SimpleCookie()
        try:
            c.load(cookie_header)
            if name in c:
                return c[name].value
        except Exception:
            pass
        return None

    def get_session_user(self):
        """Returns the logged-in user dict or None if invalid/expired session."""
        session_id = self.get_cookie('bb_session')
        if not session_id:
            return None
        now_ms = int(datetime.now().timestamp() * 1000)
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT users.id, users.email, users.name, users.phone, users.role
                FROM sessions
                JOIN users ON sessions.user_id = users.id
                WHERE sessions.id = ? AND sessions.expires_at > ?
            ''', (session_id, now_ms))
            row = cursor.fetchone()
            conn.close()
            return dict(row) if row else None
        except Exception:
            return None

    def check_auth(self, require_owner=False):
        """Validates session cookie or HTTP Basic Auth for admin endpoints."""
        user = self.get_session_user()
        if user:
            if require_owner:
                if user.get('role') == 'owner':
                    return True
                self.send_json(403, {'error': 'Forbidden: Owner role required.'})
                return False
            if user.get('role') in ('owner', 'staff'):
                return True
            self.send_json(403, {'error': 'Forbidden: Staff or owner permissions required.'})
            return False

        # Fallback Basic Auth check
        auth_header = self.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split(' ', 1)
            if len(parts) == 2 and parts[0].lower() == 'basic':
                try:
                    decoded = base64.b64decode(parts[1]).decode('utf-8')
                    username, password = decoded.split(':', 1)
                    admin_user = os.environ.get('ADMIN_USERNAME', 'admin')
                    admin_pass = os.environ.get('ADMIN_PASSWORD', 'biltong')
                    if username == admin_user and password == admin_pass:
                        return True
                except Exception:
                    pass

        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Biltong Bites Admin Access"')
        self.end_headers()
        self.wfile.write(b"Unauthorized access. Please provide valid admin credentials or log in.")
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Handle /api/auth/me
        if path == '/api/auth/me':
            user = self.get_session_user()
            if not user:
                self.send_json(200, {'authenticated': False, 'user': None, 'orders': []})
                return
            
            # Fetch orders for this email
            orders = []
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT orders.* 
                    FROM orders 
                    JOIN customers ON orders.customer_id = customers.id 
                    WHERE customers.email = ?
                    ORDER BY orders.id DESC
                ''', (user['email'],))
                for row in cursor.fetchall():
                    od = dict(row)
                    try:
                        od['cart'] = json.loads(od['cart'])
                    except Exception:
                        od['cart'] = []
                    orders.append(od)
                conn.close()
            except Exception:
                pass

            self.send_json(200, {
                'authenticated': True,
                'user': {
                    'id': user['id'],
                    'email': user['email'],
                    'name': user['name'],
                    'phone': user.get('phone') or '',
                    'role': user['role'],
                    'canAccessAdmin': user['role'] in ('owner', 'staff'),
                    'isOwner': user['role'] == 'owner',
                },
                'orders': orders,
            })
            return

        # Handle /api/admin/users (Owner only)
        if path == '/api/admin/users':
            if not self.check_auth(require_owner=True):
                return
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('SELECT id, email, name, role, created_at FROM users ORDER BY id ASC')
                users = [dict(row) for row in cursor.fetchall()]
                conn.close()
                self.send_json(200, {'users': users})
            except Exception as e:
                self.send_json(500, {'error': str(e)})
            return

        # Admin authentication guard
        if path.startswith('/admin') or path.startswith('/api/admin'):
            user = self.get_session_user()
            if user and user.get('role') == 'customer':
                # Block customer with 403
                self.send_response(403)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(b"<h1>403 Forbidden</h1><p>Customer accounts cannot access Admin area.</p><p><a href='/account/'>Return to My Account</a></p>")
                return
            if not self.check_auth():
                if path.startswith('/admin'):
                    # Redirect to login
                    self.send_response(302)
                    self.send_header('Location', '/login/?redirect=/admin/')
                    self.end_headers()
                    return
                return

        # API: Get admin dashboard data (Customers and Orders)
        if path == '/api/admin/data':
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                cursor.execute('SELECT * FROM customers ORDER BY id ASC')
                customers = [dict(row) for row in cursor.fetchall()]

                cursor.execute('''
                    SELECT orders.*, customers.name as customer_name, customers.email as customer_email, customers.phone as customer_phone
                    FROM orders 
                    JOIN customers ON orders.customer_id = customers.id 
                    ORDER BY orders.id DESC
                ''')
                orders = []
                for row in cursor.fetchall():
                    order_dict = dict(row)
                    try:
                        order_dict['cart'] = json.loads(order_dict['cart'])
                    except Exception:
                        order_dict['cart'] = []
                    orders.append(order_dict)

                conn.close()
                self.send_json(200, {'customers': customers, 'orders': orders})
            except Exception as e:
                self.send_json(500, {'error': str(e)})
            return

        super().do_GET()

    # --------------------------------------------------------------------------
    # DELETE Requests (Admin operations)
    # --------------------------------------------------------------------------
    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Handle user deletion: /api/admin/users?userId=X
        if path == '/api/admin/users':
            if not self.check_auth(require_owner=True):
                return
            query = parse_qs(parsed.query)
            user_ids = query.get('userId')
            if not user_ids:
                self.send_json(400, {'error': 'userId required.'})
                return
            target_id = int(user_ids[0])
            current_user = self.get_session_user()
            if current_user and target_id == current_user['id']:
                self.send_json(400, {'error': 'Cannot delete your own account.'})
                return
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute('DELETE FROM sessions WHERE user_id = ?', (target_id,))
                cursor.execute('DELETE FROM users WHERE id = ?', (target_id,))
                conn.commit()
                conn.close()
                self.send_json(200, {'success': True})
            except Exception as e:
                self.send_json(500, {'error': str(e)})
            return

        if path.startswith('/api/admin'):
            if not self.check_auth():
                return

            # Delete single order
            if path.startswith('/api/admin/orders/'):
                try:
                    order_id = path.split('/')[-1]
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM orders WHERE id = ?', (order_id,))
                    conn.commit()
                    conn.close()
                    self.send_json(200, {'status': 'success'})
                except Exception as e:
                    self.send_json(500, {'error': str(e)})

            # Delete single customer and cascading orders
            elif self.path.startswith('/api/admin/customers/'):
                try:
                    customer_id = self.path.split('/')[-1]
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM orders WHERE customer_id = ?', (customer_id,))
                    cursor.execute('DELETE FROM customers WHERE id = ?', (customer_id,))
                    conn.commit()
                    conn.close()
                    self.send_json(200, {'status': 'success'})
                except Exception as e:
                    self.send_json(500, {'error': str(e)})

            # Reset all orders
            elif self.path == '/api/admin/reset_orders':
                try:
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM orders')
                    cursor.execute("DELETE FROM sqlite_sequence WHERE name='orders'")
                    conn.commit()
                    conn.close()
                    self.send_json(200, {'status': 'success'})
                except Exception as e:
                    self.send_json(500, {'error': str(e)})
            return

    # --------------------------------------------------------------------------
    # POST Requests (Auth, Orders, Contact, Admin updates)
    # --------------------------------------------------------------------------
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # /api/auth/register
        if path == '/api/auth/register':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                name = (data.get('name') or '').strip()
                email = (data.get('email') or '').strip().lower()
                password = data.get('password') or ''

                if not name or not email or len(password) < 6:
                    self.send_json(400, {'error': 'Valid name, email, and password (min 6 chars) required.'})
                    return

                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM users WHERE email = ?', (email,))
                if cursor.fetchone():
                    conn.close()
                    self.send_json(409, {'error': 'An account with that email already exists.'})
                    return

                cursor.execute('SELECT COUNT(*) FROM users')
                count = cursor.fetchone()[0]
                admin_user = (os.environ.get('ADMIN_USERNAME') or 'admin').lower()
                role = 'owner' if count == 0 or email == admin_user else 'customer'

                salt = uuid.uuid4().hex
                # Use PBKDF2 HMAC SHA-256
                pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()

                cursor.execute('INSERT INTO users (email, name, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)',
                               (email, name, pwd_hash, salt, role))
                user_id = cursor.lastrowid

                # Create session
                session_id = str(uuid.uuid4())
                expires_at = int((datetime.now().timestamp() + 30 * 86400) * 1000)
                cursor.execute('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
                               (session_id, user_id, expires_at))
                conn.commit()
                conn.close()

                self.send_response(201)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Set-Cookie', f'bb_session={session_id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'user': {'id': user_id, 'email': email, 'name': name, 'role': role}}).encode('utf-8'))
                return
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

        # /api/auth/login
        if path == '/api/auth/login':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                email = (data.get('email') or '').strip().lower()
                password = data.get('password') or ''

                if not email or not password:
                    self.send_json(400, {'error': 'Email and password required.'})
                    return

                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
                user = cursor.fetchone()

                # Fallback: auto-provision owner if matches env vars
                admin_user = (os.environ.get('ADMIN_USERNAME') or 'admin').lower()
                admin_pass = os.environ.get('ADMIN_PASSWORD') or 'biltong'
                if not user and email == admin_user and password == admin_pass:
                    salt = uuid.uuid4().hex
                    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
                    cursor.execute('INSERT INTO users (email, name, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)',
                                   (email, 'Site Owner', pwd_hash, salt, 'owner'))
                    conn.commit()
                    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
                    user = cursor.fetchone()

                if not user:
                    conn.close()
                    self.send_json(401, {'error': 'Invalid email or password.'})
                    return

                salt = user['salt']
                expected_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
                if expected_hash != user['password_hash']:
                    conn.close()
                    self.send_json(401, {'error': 'Invalid email or password.'})
                    return

                # Create session
                session_id = str(uuid.uuid4())
                expires_at = int((datetime.now().timestamp() + 30 * 86400) * 1000)
                cursor.execute('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
                               (session_id, user['id'], expires_at))
                conn.commit()
                conn.close()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Set-Cookie', f'bb_session={session_id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True, 'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'role': user['role']}}).encode('utf-8'))
                return
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

        # /api/auth/logout
        if path == '/api/auth/logout':
            session_id = self.get_cookie('bb_session')
            if session_id:
                try:
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
                    conn.commit()
                    conn.close()
                except Exception:
                    pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Set-Cookie', 'bb_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            return

        # /api/auth/update_profile
        if path == '/api/auth/update_profile':
            user = self.get_session_user()
            if not user:
                self.send_json(401, {'error': 'Unauthorized. Please sign in.'})
                return

            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                name = (data.get('name') or '').strip()
                phone = (data.get('phone') or '').strip()
                current_password = data.get('currentPassword') or ''
                new_password = data.get('newPassword') or ''

                if not name:
                    self.send_json(400, {'error': 'Full name cannot be empty.'})
                    return

                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                if new_password:
                    if len(new_password) < 6:
                        conn.close()
                        self.send_json(400, {'error': 'New password must be at least 6 characters.'})
                        return
                    if not current_password:
                        conn.close()
                        self.send_json(400, {'error': 'Current password is required to set a new password.'})
                        return

                    cursor.execute('SELECT password_hash, salt FROM users WHERE id = ?', (user['id'],))
                    row = cursor.fetchone()
                    expected_hash = hashlib.pbkdf2_hmac('sha256', current_password.encode('utf-8'), row['salt'].encode('utf-8'), 100000).hex()
                    if expected_hash != row['password_hash']:
                        conn.close()
                        self.send_json(400, {'error': 'Current password does not match.'})
                        return

                    new_salt = uuid.uuid4().hex
                    new_hash = hashlib.pbkdf2_hmac('sha256', new_password.encode('utf-8'), new_salt.encode('utf-8'), 100000).hex()
                    cursor.execute('UPDATE users SET name = ?, phone = ?, password_hash = ?, salt = ? WHERE id = ?',
                                   (name, phone, new_hash, new_salt, user['id']))
                else:
                    cursor.execute('UPDATE users SET name = ?, phone = ? WHERE id = ?',
                                   (name, phone, user['id']))

                conn.commit()
                conn.close()

                self.send_json(200, {
                    'success': True,
                    'message': 'Profile updated successfully!',
                    'user': {
                        'id': user['id'],
                        'email': user['email'],
                        'name': name,
                        'phone': phone,
                        'role': user['role']
                    }
                })
                return
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

        # /api/admin/users POST actions (update_role, rename, reset_password)
        if path == '/api/admin/users':
            if not self.check_auth(require_owner=True):
                return
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                target_user_id = int(data.get('userId', 0))
                action = data.get('action')

                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM users WHERE id = ?', (target_user_id,))
                target_user = cursor.fetchone()
                if not target_user:
                    conn.close()
                    self.send_json(404, {'error': 'User not found.'})
                    return

                if action == 'update_role':
                    new_role = data.get('role')
                    if new_role not in ('customer', 'staff'):
                        conn.close()
                        self.send_json(400, {'error': 'Invalid role.'})
                        return
                    cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, target_user_id))
                    conn.commit()
                    conn.close()
                    self.send_json(200, {'success': True, 'message': f'Role updated to {new_role}.'})
                    return

                elif action == 'rename':
                    new_name = (data.get('name') or '').strip()
                    if not new_name:
                        conn.close()
                        self.send_json(400, {'error': 'Name required.'})
                        return
                    cursor.execute('UPDATE users SET name = ? WHERE id = ?', (new_name, target_user_id))
                    conn.commit()
                    conn.close()
                    self.send_json(200, {'success': True, 'message': 'User name updated.'})
                    return

                elif action == 'reset_password':
                    new_pwd = data.get('newPassword') or ''
                    if len(new_pwd) < 6:
                        conn.close()
                        self.send_json(400, {'error': 'Password min 6 chars.'})
                        return
                    salt = uuid.uuid4().hex
                    pwd_hash = hashlib.pbkdf2_hmac('sha256', new_pwd.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
                    cursor.execute('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', (pwd_hash, salt, target_user_id))
                    cursor.execute('DELETE FROM sessions WHERE user_id = ?', (target_user_id,))
                    conn.commit()
                    conn.close()
                    self.send_json(200, {'success': True, 'message': 'Password reset successfully.'})
                    return

                conn.close()
                self.send_json(400, {'error': 'Invalid action.'})
                return
            except Exception as e:
                self.send_json(500, {'error': str(e)})
                return

        # Admin complete order action
        if self.path.startswith('/api/admin'):
            if not self.check_auth():
                return

            if self.path.startswith('/api/admin/orders/') and self.path.endswith('/complete'):
                try:
                    order_id = self.path.split('/')[-2]
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('UPDATE orders SET status = "Completed" WHERE id = ?', (order_id,))
                    cursor.execute('''
                        SELECT orders.cart, orders.total, customers.name, customers.email 
                        FROM orders JOIN customers ON orders.customer_id = customers.id 
                        WHERE orders.id = ?
                    ''', (order_id,))
                    order_data = cursor.fetchone()
                    conn.commit()
                    conn.close()

                    if order_data:
                        cart_data, total_amount, cust_name, cust_email = order_data
                        sender_email = os.environ.get("SENDER_EMAIL")
                        sender_password = os.environ.get("SENDER_PASSWORD")
                        smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
                        smtp_port = int(os.environ.get("SMTP_PORT", 587))

                        if sender_email and sender_password:
                            template_content = get_template(
                                "order_complete_template.md",
                                fallback="Dear {Customer Name},\n\nYour order #{order_id} is ready for collection!\nItems: {order_items}\n"
                            )
                            # Convert DB name (Last First) to friendly name
                            email_name = cust_name
                            name_parts = cust_name.split(' ')
                            if len(name_parts) > 1:
                                email_name = f"{' '.join(name_parts[1:])} {name_parts[0]}"

                            cart_list = json.loads(cart_data) if isinstance(cart_data, str) else cart_data
                            order_items_text = ", ".join(f"{item.get('title', 'Item')} x{item.get('quantity', 1)}" for item in cart_list)

                            body = template_content.replace('[ACCOUNT_NUMBER]', os.environ.get('ACCOUNT_NUMBER', '12345678'))
                            body = body.replace('[PHONE_NUMBER]', os.environ.get('PHONE_NUMBER', '+64 27 305 7992'))
                            body = body.replace('{Customer Name}', email_name)
                            body = body.replace('{order_id}', str(order_id))
                            body = body.replace('{order_items}', order_items_text)

                            msg = EmailMessage()
                            msg['Subject'] = f'Order #{order_id} Ready for Pickup - Biltong Bites!'
                            msg['From'] = sender_email
                            msg['To'] = cust_email
                            msg.set_content(body)
                            msg.add_alternative(markdown_to_html(body), subtype='html')

                            with smtplib.SMTP(smtp_server, smtp_port) as server:
                                server.starttls()
                                server.login(sender_email, sender_password)
                                server.send_message(msg)

                    self.send_json(200, {'status': 'success'})
                except Exception as e:
                    self.send_json(500, {'error': str(e)})
            return

        # Contact form submission endpoint
        if self.path == '/api/contact':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode('utf-8'))
                name = data.get('name', 'Anonymous').strip()
                email = data.get('email', '').strip()
                message = data.get('message', '').strip()

                if not email or not message:
                    self.send_json(400, {'error': 'Email and message are required.'})
                    return

                sender_email = os.environ.get("SENDER_EMAIL")
                sender_password = os.environ.get("SENDER_PASSWORD")
                smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
                smtp_port = int(os.environ.get("SMTP_PORT", 587))

                if sender_email and sender_password:
                    template_content = get_template(
                        "contact_template.md",
                        fallback="New contact form submission:\nName: {contact_name}\nEmail: {contact_email}\nMessage:\n{contact_message}"
                    )
                    body = template_content.replace('{contact_name}', name).replace('{contact_email}', email).replace('{contact_message}', message)

                    msg = EmailMessage()
                    msg['Subject'] = f'New Inquiry from {name} - Biltong Bites'
                    msg['From'] = sender_email
                    msg['To'] = sender_email
                    msg['Reply-To'] = email
                    msg.set_content(body)
                    msg.add_alternative(markdown_to_html(body), subtype='html')

                    with smtplib.SMTP(smtp_server, smtp_port) as server:
                        server.starttls()
                        server.login(sender_email, sender_password)
                        server.send_message(msg)

                self.send_json(200, {'status': 'success'})
            except Exception as e:
                self.send_json(500, {'error': str(e)})
            return

        # Place new customer order endpoint
        if self.path == '/api/orders':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode('utf-8'))
                customer_obj = data.get('customer') if isinstance(data.get('customer'), dict) else {}
                email = (data.get('email') or customer_obj.get('email') or '').strip()
                name = (data.get('name') or customer_obj.get('name') or 'Valued Customer').strip()
                email_name = (data.get('emailName') or customer_obj.get('emailName') or name).strip()
                phone = (data.get('phone') or customer_obj.get('phone') or '').strip()
                raw_cart = data.get('cart') or data.get('items') or []
                cart = raw_cart if isinstance(raw_cart, list) else []
                total = float(data.get('total', 0.0))

                if not email or not cart or total <= 0:
                    self.send_json(400, {'status': 'error', 'message': 'Invalid order: email is missing, cart is empty, or total is zero.'})
                    return

                # Deduplicate or insert customer record
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute('SELECT id FROM customers WHERE email = ?', (email,))
                customer = cursor.fetchone()

                if customer:
                    customer_id = customer[0]
                    cursor.execute('UPDATE customers SET name = ?, phone = ? WHERE id = ?', (name, phone, customer_id))
                else:
                    cursor.execute(
                        'INSERT INTO customers (email, name, phone, created_at) VALUES (?, ?, ?, ?)',
                        (email, name, phone, datetime.now())
                    )
                    customer_id = cursor.lastrowid

                # Record new order
                cursor.execute(
                    'INSERT INTO orders (customer_id, cart, total, status, created_at) VALUES (?, ?, ?, ?, ?)',
                    (customer_id, json.dumps(cart), total, 'Pending', datetime.now())
                )
                order_id = cursor.lastrowid
                conn.commit()
                conn.close()

                print(f"\n{'='*45}\n🔔 NEW ORDER RECEIVED: #{order_id}")
                print(f"Customer: {email_name} ({email}) | Phone: {phone}")
                print(f"Total: ${total:.2f} | Items: {len(cart)}\n{'='*45}")

                # Send email notification
                sender_email = os.environ.get("SENDER_EMAIL")
                sender_password = os.environ.get("SENDER_PASSWORD")
                receiver_email = os.environ.get("RECEIVER_EMAIL", sender_email)
                smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
                smtp_port = int(os.environ.get("SMTP_PORT", 587))

                if sender_email and sender_password:
                    try:
                        template_content = get_template(
                            "email_template.md",
                            fallback="Dear {Customer Name},\n\nOrder #{order_id}\n\n{order_items}\n\nTotal: ${total}\n"
                        )
                        template_content = template_content.replace('[ACCOUNT_NUMBER]', os.environ.get('ACCOUNT_NUMBER', '12345678'))
                        template_content = template_content.replace('[PHONE_NUMBER]', os.environ.get('PHONE_NUMBER', '+64 27 305 7992'))
                        template_content = template_content.replace('{Customer Name}', email_name)

                        order_items_text = ""
                        for item in cart:
                            order_items_text += f"  * {item.get('title')} x {item.get('quantity')} @ ${float(item.get('price', 0)):.2f}\n"

                        body = template_content.replace('{order_id}', str(order_id))
                        body = body.replace('{order_items}', order_items_text.rstrip())
                        body = body.replace('${total}', f"${total:.2f}")

                        msg = EmailMessage()
                        msg['Subject'] = f'Order #{order_id} Received - Biltong Bites'
                        msg['From'] = sender_email
                        msg['To'] = f"{email}, {receiver_email}"
                        msg.set_content(body)
                        msg.add_alternative(markdown_to_html(body), subtype='html')

                        with smtplib.SMTP(smtp_server, smtp_port) as server:
                            server.starttls()
                            server.login(sender_email, sender_password)
                            server.send_message(msg)
                        print("✅ Order confirmation email sent.")
                    except Exception as err:
                        print(f"❌ Failed to send order email: {err}")

                self.send_json(200, {'status': 'success', 'order_id': order_id})
            except Exception as e:
                self.send_json(500, {'status': 'error', 'message': str(e)})
            return

        self.send_response(404)
        self.end_headers()

# ==============================================================================
# Server Runner
# ==============================================================================
if __name__ == "__main__":
    init_db()
    if not os.path.isdir(DIRECTORY):
        print(f"Error: build directory '{DIRECTORY}' not found. Run `npm run build` or build static files first.")
        sys.exit(1)

    # Allow immediate reuse of address
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), BiltongRequestHandler) as httpd:
        print(f"🚀 Biltong Bites server running at http://localhost:{PORT}")
        print(f"📁 Serving static directory: {DIRECTORY}")
        print(f"🗄️ Database: {DB_PATH}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.server_close()
