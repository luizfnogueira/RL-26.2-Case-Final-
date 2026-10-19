from fastapi import FastAPI

app = FastAPI(title="Backend API", version="0.1.0")


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "API funcionando!"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
