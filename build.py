#!/usr/bin/env python3
"""
Static Site Builder for Biltong Bites (Eleventy compiler in Python)
Reads templates in src/, parses Markdown & Frontmatter with YAML,
and compiles them with Jinja2 into _site/ directory.
"""

import os
import shutil
import glob
import json
import yaml
import markdown
import jinja2

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, "src")
OUT_DIR = os.path.join(HERE, "_site")
DATA_DIR = os.path.join(SRC_DIR, "_data")
INCLUDES_DIR = os.path.join(SRC_DIR, "_includes")

def load_site_data():
    data = {}
    site_json = os.path.join(DATA_DIR, "site.json")
    if os.path.exists(site_json):
        with open(site_json, "r", encoding="utf-8") as f:
            data["site"] = json.load(f)
    else:
        data["site"] = {"name": "Biltong Bites", "url": "https://biltongbites.org"}
    return data

def load_products():
    products = []
    prod_files = sorted(glob.glob(os.path.join(SRC_DIR, "products", "*.md")))
    for f in prod_files:
        with open(f, "r", encoding="utf-8") as fp:
            content = fp.read()
        if content.startswith("---"):
            parts = content.split("---", 2)
            meta = yaml.safe_load(parts[1]) if len(parts) > 1 else {}
            body = parts[2] if len(parts) > 2 else ""
        else:
            meta = {}
            body = content

        slug = os.path.splitext(os.path.basename(f))[0]
        url = f"/products/{slug}/"
        prod_obj = {
            "url": url,
            "data": meta,
            "content": body
        }
        products.append(prod_obj)
    
    # Sort products by price ascending
    products.sort(key=lambda p: float(p["data"].get("price", 0)))
    return products

def strip_frontmatter(text):
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) > 2:
            return parts[2]
    return text

def main():
    print(f"Building static site from {SRC_DIR} to {OUT_DIR}...")
    os.makedirs(OUT_DIR, exist_ok=True)

    # 1. Passthrough copy assets
    src_assets = os.path.join(SRC_DIR, "assets")
    out_assets = os.path.join(OUT_DIR, "assets")
    if os.path.exists(out_assets):
        shutil.rmtree(out_assets)
    if os.path.exists(src_assets):
        shutil.copytree(src_assets, out_assets)
        print("✓ Copied src/assets to _site/assets")

    # 2. Setup Jinja2 Environment
    loader = jinja2.FileSystemLoader([SRC_DIR, INCLUDES_DIR])
    env = jinja2.Environment(loader=loader, autoescape=False)

    # Custom filters
    env.filters["url"] = lambda u: u
    env.filters["safe"] = lambda text: text

    # Base context
    global_context = load_site_data()
    products = load_products()
    global_context["collections"] = {
        "products": products
    }

    # 3. Render all pages
    pages_to_build = [
        # (src_rel, out_rel)
        ("index.njk", "index.html"),
        ("account.njk", "account/index.html"),
        ("login.njk", "login/index.html"),
        ("admin.njk", "admin/index.html"),
        ("cart.njk", "cart/index.html"),
        ("checkout.njk", "checkout/index.html"),
        ("404.njk", "404.html"),
    ]

    for src_rel, out_rel in pages_to_build:
        src_path = os.path.join(SRC_DIR, src_rel)
        if not os.path.exists(src_path):
            continue
        with open(src_path, "r", encoding="utf-8") as f:
            raw = f.read()

        frontmatter = {}
        template_body = raw
        if raw.startswith("---"):
            parts = raw.split("---", 2)
            if len(parts) > 2:
                frontmatter = yaml.safe_load(parts[1]) or {}
                template_body = parts[2]

        ctx = dict(global_context)
        ctx.update(frontmatter)
        ctx["page"] = {
            "url": "/" if out_rel == "index.html" else f"/{os.path.dirname(out_rel)}/",
            "title": frontmatter.get("title", ""),
            "description": frontmatter.get("description", "")
        }

        # Render page template
        page_tpl = env.from_string(template_body)
        rendered_body = page_tpl.render(**ctx)

        # If layout specified
        layout_name = frontmatter.get("layout")
        if layout_name:
            if not layout_name.endswith(".njk"):
                layout_name += ".njk"
            layout_path = os.path.join(INCLUDES_DIR, layout_name)
            with open(layout_path, "r", encoding="utf-8") as lf:
                layout_raw = lf.read()
            layout_body = strip_frontmatter(layout_raw)
            layout_tpl = env.from_string(layout_body)
            ctx["content"] = rendered_body
            final_html = layout_tpl.render(**ctx)
        else:
            final_html = rendered_body

        out_path = os.path.join(OUT_DIR, out_rel)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(final_html)
        print(f"✓ Rendered {src_rel} -> _site/{out_rel}")

    # 4. Render product detail pages
    for prod in products:
        slug = prod["url"].strip("/").split("/")[-1]
        out_rel = f"products/{slug}/index.html"
        ctx = dict(global_context)
        ctx.update(prod["data"])
        ctx["page"] = {
            "url": prod["url"],
            "title": prod["data"].get("title", ""),
            "description": prod["data"].get("description", "")
        }
        ctx["content"] = markdown.markdown(prod["content"])

        # Load product layout
        prod_layout_path = os.path.join(INCLUDES_DIR, "layouts/product.njk")
        with open(prod_layout_path, "r", encoding="utf-8") as lf:
            prod_layout_raw = lf.read()
        prod_layout_body = strip_frontmatter(prod_layout_raw)
        prod_layout_tpl = env.from_string(prod_layout_body)
        pdp_body = prod_layout_tpl.render(**ctx)

        # Load base layout for product
        base_layout_path = os.path.join(INCLUDES_DIR, "layouts/base.njk")
        with open(base_layout_path, "r", encoding="utf-8") as bf:
            base_layout_raw = bf.read()
        base_layout_body = strip_frontmatter(base_layout_raw)
        base_layout_tpl = env.from_string(base_layout_body)
        ctx["content"] = pdp_body
        final_html = base_layout_tpl.render(**ctx)

        out_path = os.path.join(OUT_DIR, out_rel)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(final_html)
        print(f"✓ Rendered {prod['data'].get('title')} -> _site/{out_rel}")

    print("Site build complete!")

if __name__ == "__main__":
    main()
