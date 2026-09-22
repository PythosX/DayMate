import os, json, re, uuid
from datetime import datetime, date, timedelta
from pathlib import Path
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
DATA_FILE = BASE / "data.json"
FRONTEND = BASE.parent / "frontend"

load_dotenv(BASE / ".env")

APP_USERNAME = os.getenv("APP_USERNAME", "daymate")
APP_PASSWORD = os.getenv("APP_PASSWORD", "change-this-password")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

app = FastAPI(title="DayMate API")

def load_data():
    if not DATA_FILE.exists():
        return {"tasks": [], "important": [], "tell_later": [], "inbox": []}
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"tasks": [], "important": [], "tell_later": [], "inbox": []}

def save_data(data):
    DATA_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

class Login(BaseModel):
    username: str
    password: str

class VoiceRequest(BaseModel):
    transcript: str

class TaskIn(BaseModel):
    title: str
    description: str = ""
    date: str = ""
    time: str = ""
    priority: str = "medium"
    category: str = "general"

class ImportantIn(BaseModel):
    title: str
    description: str = ""
    date: str = ""
    time: str = ""
    type: str = "important"
    priority: str = "medium"

class TellLaterIn(BaseModel):
    person: str = ""
    message: str
    date: str = ""
    time: str = ""
    priority: str = "medium"

class InboxIn(BaseModel):
    content: str

def item_id():
    return uuid.uuid4().hex[:10]

def clean_json(text):
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

def gemini_parse(transcript):
    if not GEMINI_API_KEY:
        return None

    today = date.today().isoformat()
    prompt = f"""
You are DayMate, a personal memory assistant.
Today's date is {today}.

Interpret the user's natural-language message. Do not depend on exact wording.
Return ONLY valid JSON with this schema:

{{
  "type": "task|important|tell_later|clarification",
  "title": "short title",
  "description": "useful details",
  "person": "",
  "date": "YYYY-MM-DD or empty",
  "time": "HH:MM or empty",
  "priority": "low|medium|high",
  "category": "general|assignment|exam|appointment|submission|event|deadline|personal|other",
  "question": "",
  "confidence": 0.0
}}

Rules:
- task = something the user needs to do.
- important = a date/deadline/event the user primarily needs to remember.
- tell_later = something the user wants to tell a specific person later.
- clarification = use when essential information is missing or ambiguous. Put one short question in question.
- Never invent an exact date or time when the user did not provide enough information.
- Understand relative dates such as tomorrow, next Monday, next week when possible.
- A sentence like "remind me to tell Rahul about the internship on Friday" is tell_later.
- A deadline/submission date can be important.
- Respond with JSON only.

User message:
{transcript}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    try:
        r = requests.post(
            url,
            params={"key": GEMINI_API_KEY},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=25
        )
        r.raise_for_status()
        text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(clean_json(text))
    except Exception:
        return None

def fallback_parse(t):
    s = t.lower().strip()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    today = date.today().isoformat()

    m = re.search(r"\b(?:at|around)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", s)
    tm = ""
    if m:
        h = int(m.group(1)); minute = int(m.group(2) or 0); ap = m.group(3)
        if ap:
            if ap == "pm" and h < 12: h += 12
            if ap == "am" and h == 12: h = 0
        tm = f"{h:02d}:{minute:02d}"

    d = tomorrow if "tomorrow" in s else (today if "today" in s else "")

    tell = re.search(r"(?:tell|message|let)\s+([A-Za-z][A-Za-z0-9_-]*)\s+(?:about|that)\s+(.+)", t, re.I)
    if tell:
        return {
            "type":"tell_later","title":"Tell someone later",
            "description":tell.group(2).strip(),"person":tell.group(1),
            "date":d,"time":tm,"priority":"medium","category":"personal",
            "question":"","confidence":0.65
        }

    if any(x in s for x in ["deadline","due","submission","exam date","appointment","registration closes","event on"]):
        return {
            "type":"important","title":t[:80],"description":t,
            "person":"","date":d,"time":tm,"priority":"high",
            "category":"deadline","question":"","confidence":0.55
        }

    return {
        "type":"task","title":t[:80],"description":t,
        "person":"","date":d,"time":tm,"priority":"medium",
        "category":"general","question":"","confidence":0.5
    }

def parse_voice(t):
    result = gemini_parse(t) or fallback_parse(t)
    result.setdefault("type", "clarification")
    result.setdefault("question", "")
    result.setdefault("title", "")
    result.setdefault("description", "")
    result.setdefault("person", "")
    result.setdefault("date", "")
    result.setdefault("time", "")
    result.setdefault("priority", "medium")
    result.setdefault("category", "general")
    result.setdefault("confidence", 0.5)
    return result

@app.get("/")
def root():
    return FileResponse(FRONTEND / "index.html")

@app.get("/styles.css")
def css():
    return FileResponse(FRONTEND / "styles.css", media_type="text/css")

@app.get("/app.js")
def js():
    return FileResponse(FRONTEND / "app.js", media_type="application/javascript")

@app.post("/api/login")
def login(body: Login):
    if body.username != APP_USERNAME or body.password != APP_PASSWORD:
        raise HTTPException(401, "Invalid username or password")
    return {"ok": True, "username": APP_USERNAME}

@app.get("/api/data")
def get_data():
    return load_data()

@app.post("/api/voice/parse")
def voice_parse(body: VoiceRequest):
    if not body.transcript.strip():
        raise HTTPException(400, "Empty transcript")
    return parse_voice(body.transcript)

@app.post("/api/tasks")
def add_task(body: TaskIn):
    data = load_data()
    item = body.model_dump()
    item["id"] = item_id()
    item["done"] = False
    data["tasks"].append(item)
    save_data(data)
    return item

@app.patch("/api/tasks/{iid}")
def toggle_task(iid: str):
    data = load_data()
    for x in data["tasks"]:
        if x["id"] == iid:
            x["done"] = not x.get("done", False)
            save_data(data)
            return x
    raise HTTPException(404, "Task not found")

@app.delete("/api/tasks/{iid}")
def delete_task(iid: str):
    data = load_data()
    data["tasks"] = [x for x in data["tasks"] if x["id"] != iid]
    save_data(data)
    return {"ok": True}

@app.post("/api/important")
def add_important(body: ImportantIn):
    data = load_data()
    item = body.model_dump()
    item["id"] = item_id()
    data["important"].append(item)
    save_data(data)
    return item

@app.delete("/api/important/{iid}")
def delete_important(iid: str):
    data = load_data()
    data["important"] = [x for x in data["important"] if x["id"] != iid]
    save_data(data)
    return {"ok": True}

@app.post("/api/tell-later")
def add_tell_later(body: TellLaterIn):
    data = load_data()
    item = body.model_dump()
    item["id"] = item_id()
    item["done"] = False
    data["tell_later"].append(item)
    save_data(data)
    return item

@app.patch("/api/tell-later/{iid}")
def toggle_tell_later(iid: str):
    data = load_data()
    for x in data["tell_later"]:
        if x["id"] == iid:
            x["done"] = not x.get("done", False)
            save_data(data)
            return x
    raise HTTPException(404, "Tell Later note not found")

@app.delete("/api/tell-later/{iid}")
def delete_tell_later(iid: str):
    data = load_data()
    data["tell_later"] = [x for x in data["tell_later"] if x["id"] != iid]
    save_data(data)
    return {"ok": True}

@app.post("/api/inbox")
def add_inbox(body: InboxIn):
    data = load_data()
    item = body.model_dump()
    item["id"] = item_id()
    data["inbox"].append(item)
    save_data(data)
    return item

@app.delete("/api/inbox/{iid}")
def delete_inbox(iid: str):
    data = load_data()
    data["inbox"] = [x for x in data["inbox"] if x["id"] != iid]
    save_data(data)
    return {"ok": True}
