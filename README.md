# DayMate — Personal Memory Assistant

DayMate is a voice-first personal memory assistant designed to stay open on a spare phone.

It separates:
- **Tasks** — things you need to do
- **Important** — dates you need to remember
- **Tell Later** — things you want to tell someone at a future time
- **Inbox** — thoughts you want to organize later

## MVP architecture

Browser → Web Speech API → FastAPI → Gemini API → JSON storage

The browser handles speech recognition and speech synthesis. Gemini interprets natural language. The backend stores structured information.

## Features

- Single-user login
- Lock-screen-inspired primary screen
- Voice-first interaction
- Natural-language task/reminder classification
- Important dates
- Tell Later notes
- Manual text fallback
- Today / Tasks / Important / Tell Later / Inbox views
- Browser notification support while the app is open
- Gemini fallback parser if the API is unavailable
- No Supabase required

## Run locally

1. Install Python 3.10+.
2. Open a terminal in `backend`.
3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Copy `.env.example` to `.env`.
5. Set your login credentials.
6. Add a Gemini API key if you want AI parsing.
7. Start:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

8. Open `http://localhost:8000`.

## Important production note

The included JSON storage is intentionally simple for an MVP. Many free cloud hosts use ephemeral disks, so data can disappear after a restart/redeploy. For a persistent production version, move storage to SQLite on persistent storage or a hosted database.

Also, browser notifications are not a replacement for reliable server-side push notifications when the browser/app is closed.

## Privacy

DayMate stores the transcript-derived structured data, not audio recordings. Browser speech recognition behavior varies by browser and may use a browser/provider speech service. Do not put API keys in frontend JavaScript.
