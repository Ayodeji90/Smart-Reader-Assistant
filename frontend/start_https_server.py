import http.server
import ssl
import os

# Create self-signed cert if it doesn't exist
if not os.path.exists("cert.pem") or not os.path.exists("key.pem"):
    print("Generating self-signed SSL certificate...")
    os.system("openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'")

server_address = ('0.0.0.0', 3000)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

# Wrap the socket with SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print("Starting HTTPS server on https://0.0.0.0:3000/")
print("Use your mobile device to connect to https://YOUR_LAPTOP_IP:3000")
httpd.serve_forever()
