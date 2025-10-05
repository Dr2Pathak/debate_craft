from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from dotenv import load_dotenv
import uvicorn

# Load environment variables
load_dotenv()

# Import API routers
from app.api import auth, embeddings, debate

app = FastAPI(
    title="DebateCraft API",
    description="API for DebateCraft application with Pinecone integration",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",  # Frontend dev server
        "http://localhost:3000",  # Alternative frontend port
        "https://*.lovable.dev",   # Lovable production domains
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(embeddings.router, prefix="/api/v1/embeddings", tags=["embeddings"])
app.include_router(debate.router, prefix="/api/v1/debate", tags=["debate"])

@app.get("/")
async def root():
    return {"message": "DebateCraft API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
