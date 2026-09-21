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

    def check_auth(self):
        """Validates HTTP Basic Authentication credentials for admin endpoints."""
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
        self.wfile.write(b"Unauthorized access. Please provide valid admin credentials.")
        return False

    # --------------------------------------------------------------------------
    # GET Requests
    # --------------------------------------------------------------------------
    def do_GET(self):
        # Admin authentication guard
        if self.path.startswith('/admin') or self.path.startswith('/api/admin'):
            if not self.check_auth():
                return

        # API: Get admin dashboard data (Customers and Orders)
        if self.path == '/api/admin/data':
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
        if self.path.startswith('/api/admin'):
            if not self.check_auth():
                return

            # Delete single order
            if self.path.startswith('/api/admin/orders/'):
                try:
                    order_id = self.path.split('/')[-1]
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
    # POST Requests (Orders, Contact, Admin updates)
    # --------------------------------------------------------------------------
    def do_POST(self):
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
                email = data.get('email', '').strip()
                name = data.get('name', 'Valued Customer').strip()
                email_name = data.get('emailName', name).strip()
                phone = data.get('phone', '').strip()
                cart = data.get('cart', [])
                total = float(data.get('total', 0.0))

                if not email or not cart or total <= 0:
                    self.send_json(400, {'status': 'error', 'message': 'Invalid order: cart is empty or total is zero.'})
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
