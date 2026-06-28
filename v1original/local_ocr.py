"""
本地 OCR 模块：使用 PP-OCRv4（rapidocr-onnxruntime）识别药品说明书文字。
支持倾斜校正、中英文混排与密集小字场景。
"""
from __future__ import annotations

import os
from typing import List, Tuple

_ocr_engine = None


def _get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR

        # PP-OCRv4 det/rec + 方向分类，适合说明书复杂排版
        _ocr_engine = RapidOCR()
    return _ocr_engine


def _box_center(box) -> Tuple[float, float]:
    xs = [float(p[0]) for p in box]
    ys = [float(p[1]) for p in box]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _sort_reading_order(items: List[Tuple]) -> List[str]:
    """按从上到下、从左到右排序 OCR 文本块。"""
    if not items:
        return []

    row_threshold = 18
    sorted_items = sorted(items, key=lambda item: (_box_center(item[0])[1], _box_center(item[0])[0]))

    rows: List[List[Tuple]] = []
    for item in sorted_items:
        cy = _box_center(item[0])[1]
        placed = False
        for row in rows:
            row_y = sum(_box_center(r[0])[1] for r in row) / len(row)
            if abs(cy - row_y) <= row_threshold:
                row.append(item)
                placed = True
                break
        if not placed:
            rows.append([item])

    texts: List[str] = []
    for row in rows:
        row.sort(key=lambda item: _box_center(item[0])[0])
        for item in row:
            text = str(item[1] or "").strip()
            score = float(item[2]) if len(item) > 2 and item[2] is not None else 1.0
            if text and score >= 0.45:
                texts.append(text)
    return texts


def extract_text_from_image(image_path: str) -> str:
    """
    从图片中提取文字，返回按阅读顺序拼接的纯文本。
    图片应已做适当压缩/预处理（见 utils.prepare_image_for_ocr）。
    """
    if not image_path or not os.path.exists(image_path):
        return ""

    engine = _get_ocr_engine()
    result, _ = engine(image_path)
    if not result:
        return ""

    lines = _sort_reading_order(result)
    return "\n".join(lines)
