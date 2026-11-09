import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://dailymoney:dailymoney@localhost:5432/dailymoney_test",
)
os.environ["SECRET_KEY"] = "test-secret-key-with-enough-length-1234"
os.environ["GOOGLE_CLIENT_IDS"] = "web-client.apps.googleusercontent.com,ios-client"
os.environ["ALLOWED_EMAILS"] = "thiago@example.com,Partner@Example.com"
