CueCash 8-Ball — Ready for Render (Simplified Bundle)
----------------------------------------------------

Contents:
- backend/         Node.js API server (Express + Socket.IO + SQLite)
- frontend/        React UI (via UMD CDN) + Tailwind CDN + game canvas (Matter.js)
- render.yaml      Render configuration for auto-deploy
- deploy_render.sh Simple script to help deploy on Render (use Render shell)

Quick local run (development):
1. Install Node.js v18+
2. Open terminal -> backend
   npm install
   node server.js
3. Open frontend/index.html in a browser (or serve the folder). The frontend uses WebSockets to connect to backend at the same host/port (defaults to http://localhost:4000)

Render deployment (high-level):
- Create a Render account, create a new Web Service, upload the repository (ZIP), set required environment variables from .env.example, and deploy.
- Or use the render.yaml and Render's Git/ZIP deploy features.

.env configuration (backend/.env):
- JWT_SECRET=your_jwt_secret
- MPESA_CONSUMER_KEY=
- MPESA_CONSUMER_SECRET=
- MPESA_SHORTCODE=174379
- MPESA_PASSKEY=
- PAYPAL_CLIENT_ID=
- PAYPAL_SECRET=
- CRYPTO_API_KEY=

Demo accounts (seeded on first run):
- Admin: kigenkigen455@gmail.com / adminpass123 (is_admin = 1)
- player1@cuecash.test / pass123 (balance 500)
- player2@cuecash.test / pass123 (balance 500)
- player3@cuecash.test / pass123 (balance 500)
- player4@cuecash.test / pass123 (balance 500)

Notes:
- Payments are sandbox placeholders. Use Safaricom developer sandbox and PayPal sandbox credentials.
- This bundle aims to be a complete, hostable starting point. For production, replace SQLite with managed DB, secure secrets, enable HTTPS, and complete payment provider integrations.
