# StellarWeb auth demo

Simple demo that provides a single-page sign in / sign up UI and a small Express server using a single shared SQLite connection.

How to run (PowerShell on Windows):

```powershell
cd "C:/Users/Jae/OneDrive/Desktop/stellarweb"
npm install
npm start

# Then open http://localhost:3000 in your browser
```

Notes
- Passwords are hashed with bcrypt (bcryptjs). Do not store plaintext.
- The database file is created at `data/database.db` and initialized from `query.sql` on first run.
- Both sign-in and sign-up use the same backend endpoint: `POST /api/auth` with JSON { action: 'signup'|'signin', ... }

Example payloads
- Sign up: { "action":"signup", "username":"jdoe", "email":"jdoe@example.com", "password":"secret", "role":"NOC" }
- Sign in: { "action":"signin", "username":"jdoe", "password":"secret" }
