import base64
import io
import os
from typing import Optional

import requests
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from torchvision import transforms
from transformers import AutoModelForImageSegmentation


MODEL_ID = os.environ.get("BIREFNET_MODEL_ID", "ZhengPeng7/BiRefNet_HR")
HOST = os.environ.get("BIREFNET_HOST", "127.0.0.1")
PORT = int(os.environ.get("BIREFNET_PORT", "7861"))

app = FastAPI(title="ASUI BiRefNet HR Cutout Service")
_model = None
_device = "cuda" if torch.cuda.is_available() else "cpu"


class CutoutRequest(BaseModel):
    image: str
    model: Optional[str] = "BiRefNet_HR"
    output_format: Optional[str] = "png"


def _read_image(value: str) -> Image.Image:
    if value.startswith("data:image/"):
        _, encoded = value.split(",", 1)
        data = base64.b64decode(encoded)
        return Image.open(io.BytesIO(data)).convert("RGB")

    if value.startswith("http://") or value.startswith("https://"):
        response = requests.get(value, timeout=30)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content)).convert("RGB")

    try:
        return Image.open(value).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unsupported image input: {exc}") from exc


def _load_model():
    global _model
    if _model is None:
        torch.set_float32_matmul_precision("high")
        _model = AutoModelForImageSegmentation.from_pretrained(MODEL_ID, trust_remote_code=True)
        _model.to(_device)
        _model.eval()
    return _model


def _to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_ID, "device": _device, "loaded": _model is not None}


@app.post("/cutout")
def cutout(request: CutoutRequest):
    image = _read_image(request.image)
    model = _load_model()
    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    tensor = transform(image).unsqueeze(0).to(_device)

    with torch.no_grad():
        prediction = model(tensor)[-1].sigmoid().cpu()[0].squeeze()

    mask = transforms.ToPILImage()(prediction).resize(image.size)
    result = image.convert("RGBA")
    result.putalpha(mask)

    return {"image": _to_data_url(result), "model": MODEL_ID, "device": _device}


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
