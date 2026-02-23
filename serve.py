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
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            cart TEXT NOT NULL,
            total REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
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
                
                # Insert into DB
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute(
                    'INSERT INTO orders (name, phone, email, cart, total, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    (name, phone, email, json.dumps(cart), total, datetime.now())
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
