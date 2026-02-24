#!/usr/bin/env python3
"""
Simple HTTP server for serving the built Eleventy site.
Usage: python serve.py [port]
Defaults to port 8000 and serves the `_site` directory.
"""
import http.server
import socketserver
import sys
import os
import sqlite3
import json
import smtplib
import base64
from email.message import EmailMessage
from datetime import datetime

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
HERE = os.path.dirname(os.path.abspath(__file__))
DIRECTORY = os.path.join(HERE, "_site")
DB_PATH = os.path.join(HERE, "orders.db")
ENV_PATH = os.path.join(HERE, ".env")

# Simple .env loader
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, 'r') as f:
        for line in f:
            if '=' in line and not line.strip().startswith('#'):
                key, val = line.strip().split('=', 1)
                os.environ[key] = val

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Back up old orders table if it exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'")
    if cursor.fetchone():
        try:
            cursor.execute("ALTER TABLE orders RENAME TO old_orders")
        except sqlite3.OperationalError:
            pass # old_orders might already exist

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
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

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def check_auth(self):
        auth_header = self.headers.get('Authorization')
        if auth_header:
            auth_type, encoded = auth_header.split(' ', 1)
            if auth_type.lower() == 'basic':
                try:
                    decoded = base64.b64decode(encoded).decode('utf-8')
                    username, password = decoded.split(':', 1)
                    admin_user = os.environ.get('ADMIN_USERNAME')
                    admin_pass = os.environ.get('ADMIN_PASSWORD')
                    if admin_user and admin_pass and username == admin_user and password == admin_pass:
                        return True
                except Exception:
                    pass
        
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Admin Access"')
        self.end_headers()
        self.wfile.write(b"Unauthorized access")
        return False

    def do_GET(self):
        # Protect admin page
        if self.path.startswith('/admin') or self.path.startswith('/api/admin'):
            if not self.check_auth():
                return
                
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
                    ORDER BY orders.id ASC
                ''')
                orders = []
                for row in cursor.fetchall():
                    order_dict = dict(row)
                    order_dict['cart'] = json.loads(order_dict['cart'])
                    orders.append(order_dict)
                    
                conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'customers': customers, 'orders': orders}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        super().do_GET()

    def do_DELETE(self):
        if self.path.startswith('/api/admin'):
            if not self.check_auth():
                return
            if self.path.startswith('/api/admin/orders/'):
                try:
                    order_id = self.path.split('/')[-1]
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM orders WHERE id = ?', (order_id,))
                    conn.commit()
                    conn.close()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            elif self.path.startswith('/api/admin/customers/'):
                try:
                    customer_id = self.path.split('/')[-1]
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    # Delete associated orders first to avoid foreign key constraints
                    cursor.execute('DELETE FROM orders WHERE customer_id = ?', (customer_id,))
                    # Delete the customer
                    cursor.execute('DELETE FROM customers WHERE id = ?', (customer_id,))
                    conn.commit()
                    conn.close()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            elif self.path == '/api/admin/reset_orders':
                try:
                    conn = sqlite3.connect(DB_PATH)
                    cursor = conn.cursor()
                    cursor.execute('DELETE FROM orders')
                    cursor.execute("DELETE FROM sqlite_sequence WHERE name='orders'")
                    conn.commit()
                    conn.close()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

    def do_POST(self):
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
                        # Send completion email logic
                        cart_data, total_amount, cust_name, cust_email = order_data
                        
                        smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
                        smtp_port = int(os.environ.get("SMTP_PORT", 587))
                        sender_email = os.environ.get("SENDER_EMAIL")
                        sender_password = os.environ.get("SENDER_PASSWORD")
                        
                        if sender_email and sender_password:
                            msg = EmailMessage()
                            msg['Subject'] = f'Order #{order_id} Completed - Biltong Bites !'
                            msg['From'] = sender_email
                            msg['To'] = cust_email
                            
                            template_path = os.path.join(HERE, "order_complete_template.md")
                            if os.path.exists(template_path):
                                with open(template_path, 'r', encoding='utf-8') as f:
                                    template_content = f.read()
                            else:
                                template_content = "Order #{order_id} is complete!"
                                
                            # Convert DB Name (Last First) to Email Name (First Last)
                            email_name = cust_name
                            name_parts = cust_name.split(' ')
                            if len(name_parts) > 1:
                                last = name_parts[0]
                                first = ' '.join(name_parts[1:])
                                email_name = f"{first} {last}"
                                
                            # Format order items for the email
                            cart_list = json.loads(cart_data)
                            order_items_text = ""
                            for item in cart_list:
                                order_items_text += f"{item.get('title', 'Item')} x {item.get('quantity', 1)}, "
                            order_items_text = order_items_text.rstrip(', ')
                                
                            # Replace environment variables specifically for this template as well
                            body = template_content.replace('[ACCOUNT_NUMBER]', os.environ.get('ACCOUNT_NUMBER', '12345678'))
                            body = body.replace('[PHONE_NUMBER]', os.environ.get('PHONE_NUMBER', '021 000 0000'))
                                
                            body = body.replace('{Customer Name}', email_name).replace('{order_id}', str(order_id)).replace('{order_items}', order_items_text)
                            
                            msg.set_content(body)
                            
                            import re
                            html_body = body
                            html_body = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_body)
                            html_body = re.sub(r'^### (.*)', r'<h3>\1</h3>', html_body, flags=re.MULTILINE)
                            html_body = html_body.replace('\n\n', '<br><br>').replace('\n', '<br>')
                            html_body = f"<html><body style='font-family: sans-serif;'>\n{html_body}\n</body></html>"
                            
                            msg.add_alternative(html_body, subtype='html')
                            with smtplib.SMTP(smtp_server, smtp_port) as server:
                                server.starttls()
                                server.login(sender_email, sender_password)
                                server.send_message(msg)
                                
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
                except Exception as e:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return
            
        if self.path == '/api/contact':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                name = data.get('name', 'Anonymous')
                email = data.get('email', 'No Email')
                message = data.get('message', '')
                
                smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
                smtp_port = int(os.environ.get("SMTP_PORT", 587))
                sender_email = os.environ.get("SENDER_EMAIL")
                sender_password = os.environ.get("SENDER_PASSWORD")
                
                if sender_email and sender_password:
                    msg = EmailMessage()
                    msg['Subject'] = f'New Contact Form Message from {name}'
                    msg['From'] = sender_email
                    msg['To'] = sender_email
                    msg['Reply-To'] = email
                    
                    template_path = os.path.join(HERE, "contact_template.md")
                    if os.path.exists(template_path):
                        with open(template_path, 'r', encoding='utf-8') as f:
                            template_content = f.read()
                    else:
                        template_content = "Name: {contact_name}\nEmail: {contact_email}\nMessage:\n{contact_message}"
                        
                    body = template_content.replace('{contact_name}', name).replace('{contact_email}', email).replace('{contact_message}', message)
                    
                    msg.set_content(body)
                    
                    import re
                    html_body = body
                    html_body = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_body)
                    html_body = re.sub(r'^### (.*)', r'<h3>\1</h3>', html_body, flags=re.MULTILINE)
                    html_body = html_body.replace('\n\n', '<br><br>').replace('\n', '<br>')
                    html_body = f"<html><body style='font-family: sans-serif;'>\n{html_body}\n</body></html>"
                    
                    msg.add_alternative(html_body, subtype='html')
                    with smtplib.SMTP(smtp_server, smtp_port) as server:
                        server.starttls()
                        server.login(sender_email, sender_password)
                        server.send_message(msg)
                        
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        if self.path == '/api/orders':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                email = data.get('email')
                name = data.get('name', 'Valued Customer')
                email_name = data.get('emailName', name)
                phone = data.get('phone', 'N/A')
                cart = data.get('cart', [])
                total = data.get('total', 0.0)
                
                # Manage Customer Deduplication
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                
                # Check if customer exists
                cursor.execute('SELECT id FROM customers WHERE email = ?', (email,))
                customer = cursor.fetchone()
                
                if customer:
                    customer_id = customer[0]
                    # Optionally update their name/phone if they provided new ones
                    cursor.execute('UPDATE customers SET name = ?, phone = ? WHERE id = ?', (name, phone, customer_id))
                else:
                    # Insert new customer
                    cursor.execute(
                        'INSERT INTO customers (email, name, phone, created_at) VALUES (?, ?, ?, ?)',
                        (email, name, phone, datetime.now())
                    )
                    customer_id = cursor.lastrowid
                
                # Insert order linked to the customer_id
                cursor.execute(
                    'INSERT INTO orders (customer_id, cart, total, status, created_at) VALUES (?, ?, ?, ?, ?)',
                    (customer_id, json.dumps(cart), total, 'Pending', datetime.now())
                )
                order_id = cursor.lastrowid
                conn.commit()
                conn.close()
                
                # Notification
                print(f"\n{'='*40}")
                print(f"🔔 NEW ORDER RECEIVED!")
                print(f"Email: {email}")
                print(f"Total: ${total:.2f}")
                print(f"Items: {len(cart)}")
                
                # Send Real Email
                smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
                smtp_port = int(os.environ.get("SMTP_PORT", 587))
                sender_email = os.environ.get("SENDER_EMAIL")
                sender_password = os.environ.get("SENDER_PASSWORD")
                receiver_email = os.environ.get("RECEIVER_EMAIL", sender_email)
                
                if sender_email and sender_password:
                    print(f"📧 Sending payment details email to {email} and notification to {receiver_email}...")
                    try:
                        msg = EmailMessage()
                        msg['Subject'] = f'New Order #{order_id} Received - Biltong Bites'
                        msg['From'] = sender_email
                        msg['To'] = f"{email}, {receiver_email}"
                        
                        # Load template
                        template_path = os.path.join(HERE, "email_template.md")
                        if os.path.exists(template_path):
                            with open(template_path, 'r', encoding='utf-8') as f:
                                template_content = f.read()
                        else:
                            # Fallback if template is missing
                            template_content = "Order #{order_id}\n\n{order_items}\nTotal: ${total}\n"
                            
                        # Replace .env and dynamic variables
                        template_content = template_content.replace('[ACCOUNT_NUMBER]', os.environ.get('ACCOUNT_NUMBER', '12345678'))
                        template_content = template_content.replace('[PHONE_NUMBER]', os.environ.get('PHONE_NUMBER', '021 000 0000'))
                        template_content = template_content.replace('{Customer Name}', email_name)
                            
                        # Format items
                        order_items_text = ""
                        for item in cart:
                            order_items_text += f"  * {item.get('title')} x {item.get('quantity')} @ ${float(item.get('price', 0)):.2f}\n"
                            
                        body = template_content.format(
                            order_id=order_id,
                            order_items=order_items_text.rstrip(),
                            total=f"{total:.2f}"
                        )
                        
                        msg.set_content(body)
                        
                        # Convert basic markdown to HTML
                        import re
                        html_body = body
                        # Bold
                        html_body = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_body)
                        # Headings
                        html_body = re.sub(r'^### (.*)', r'<h3>\1</h3>', html_body, flags=re.MULTILINE)
                        
                        # Lists
                        lines = html_body.split('\n')
                        in_list = False
                        html_lines = []
                        for line in lines:
                            if line.strip().startswith('* '):
                                if not in_list:
                                    html_lines.append('<ul>')
                                    in_list = True
                                # handle list item
                                html_lines.append(f"<li>{line.strip().replace('* ', '', 1).strip()}</li>")
                            else:
                                if in_list:
                                    html_lines.append('</ul>')
                                    in_list = False
                                
                                if line.startswith('<h'):
                                    html_lines.append(line)
                                elif line.strip() == '':
                                    html_lines.append('<br>')
                                else:
                                    html_lines.append(line)
                                    
                        if in_list:
                            html_lines.append('</ul>')
                        
                        html_body = '\n'.join(html_lines)
                        
                        # Wrap in HTML document
                        html_body = f"<html><body style='font-family: sans-serif; line-height: 1.5;'>\n{html_body}\n</body></html>"
                        
                        msg.add_alternative(html_body, subtype='html')
                        
                        with smtplib.SMTP(smtp_server, smtp_port) as server:
                            server.starttls()
                            server.login(sender_email, sender_password)
                            server.send_message(msg)
                        print("✅ Email sent successfully.")
                    except Exception as email_err:
                        print(f"❌ Failed to send email: {email_err}")
                else:
                    print(f"⚠️ Email credentials not found in .env. Skipping real email send.")
                    print(f"📧 Simulated email to {email}...")
                
                print(f"{'='*40}\n")
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode('utf-8'))
            except Exception as e:
                print(f"Error handling order: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    init_db()
    if not os.path.isdir(DIRECTORY):
        print(f"Error: build directory '{DIRECTORY}' not found. Run `npm run build` first.")
        sys.exit(1)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving site at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            httpd.server_close()
