#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
多模态素材网格切图工具 (Sprite Sheet Slicer)
将网页端 Gemini 生成的 N行xM列 拼图素材自动裁切为独立图片文件。
"""

import argparse
import json
import os
import sys
from pathlib import Path


def slice_image(
    input_path: str,
    output_dir: str,
    rows: int,
    cols: int,
    padding: int = 0,
    outer_margin: int = 0,
    prefix: str = "sprite",
    names: list[str] | None = None,
) -> list[str]:
    try:
        from PIL import Image
    except ImportError:
        print(
            "错误：未检测到 Pillow 库。请先在项目虚拟环境中安装 Pillow (pip install Pillow)。",
            file=sys.stderr,
        )
        sys.exit(1)

    src = Path(input_path).resolve()
    if not src.exists():
        print(f"错误：找不到输入图片文件: {src}", file=sys.stderr)
        sys.exit(1)

    out_path = Path(output_dir).resolve()
    out_path.mkdir(parents=True, exist_ok=True)

    with Image.open(src) as img:
        width, height = img.size
        usable_w = width - 2 * outer_margin
        usable_h = height - 2 * outer_margin
        cell_w = usable_w / cols
        cell_h = usable_h / rows

        saved_files: list[str] = []
        idx = 0
        for r in range(rows):
            for c in range(cols):
                left = int(round(outer_margin + c * cell_w + padding))
                top = int(round(outer_margin + r * cell_h + padding))
                right = int(round(outer_margin + (c + 1) * cell_w - padding))
                bottom = int(round(outer_margin + (r + 1) * cell_h - padding))

                if right <= left or bottom <= top:
                    print(
                        f"警告：padding ({padding}) 过大导致第 {r+1} 行第 {c+1} 列裁剪区域无效，已跳过。",
                        file=sys.stderr,
                    )
                    continue

                cropped = img.crop((left, top, right, bottom))
                if names and idx < len(names) and names[idx].strip():
                    stem = names[idx].strip()
                else:
                    stem = f"{prefix}_r{r+1}_c{c+1}_{idx+1:02d}"

                dest_file = out_path / f"{stem}.png"
                cropped.save(dest_file, format="PNG")
                saved_files.append(str(dest_file))
                idx += 1

    return saved_files


def main() -> None:
    parser = argparse.ArgumentParser(
        description="将网页版 Gemini 生成的网格拼图 (Sprite Sheet) 自动裁切为独立素材文件。"
    )
    parser.add_argument("--input", "-i", required=True, help="输入的网格大图路径")
    parser.add_argument("--output-dir", "-o", required=True, help="切图输出目录路径")
    parser.add_argument("--rows", "-r", type=int, default=2, help="网格行数 (默认: 2)")
    parser.add_argument("--cols", "-c", type=int, default=2, help="网格列数 (默认: 2)")
    parser.add_argument(
        "--padding",
        "-p",
        type=int,
        default=0,
        help="每个格子向内收缩的像素边距，用于去除网格分割线 (默认: 0)",
    )
    parser.add_argument(
        "--outer-margin",
        "-m",
        type=int,
        default=0,
        help="整张大图四周的外边距像素 (默认: 0)",
    )
    parser.add_argument(
        "--prefix", default="card", help="输出文件名前缀 (默认: card)"
    )
    parser.add_argument(
        "--names",
        default="",
        help="可选：逗号分隔的自定义文件名列表，如 'liubei,guanyu,zhangfei,zhugeliang'",
    )

    args = parser.parse_args()
    custom_names = [n.strip() for n in args.names.split(",") if n.strip()] if args.names else None

    saved = slice_image(
        input_path=args.input,
        output_dir=args.output_dir,
        rows=args.rows,
        cols=args.cols,
        padding=args.padding,
        outer_margin=args.outer_margin,
        prefix=args.prefix,
        names=custom_names,
    )

    print(
        json.dumps(
            {
                "status": "ok",
                "input": str(Path(args.input).resolve()),
                "grid": f"{args.rows}x{args.cols}",
                "count": len(saved),
                "files": saved,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
