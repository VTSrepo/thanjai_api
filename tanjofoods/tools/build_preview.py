"""
Builds preview/Tanjo_Foods_Design_Preview.html – ONE self-contained file
(CSS, JS, product data and all images embedded) that can be e-mailed to the
client and opened by double-click. Fully clickable: browse, add to cart,
checkout (demo – no order is sent).

    python tools/build_preview.py
"""
import base64, os, re, mimetypes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(ROOT, p), encoding="utf-8").read()

html = rd("index.html")
css = rd("assets/css/styles.css")
data = rd("data/products.js")
js = rd("assets/js/app.js")
i18n = rd("assets/js/i18n.js")

def data_uri(rel):
    path = os.path.join(ROOT, rel)
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    if path.endswith(".svg"): mime = "image/svg+xml"
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()

cache = {}
def embed(text):
    def rep(m):
        rel = m.group(0)
        if rel not in cache: cache[rel] = data_uri(rel)
        return cache[rel]
    return re.sub(r"assets/img/[A-Za-z0-9_\-\.]+\.(?:jpg|jpeg|png|webp|svg)", rep, text)

# Preview never talks to an API
data = re.sub(r'apiBase:\s*"[^"]*"', 'apiBase: ""', data)

html = html.replace('<link rel="stylesheet" href="assets/css/styles.css">', "<style>\n" + css + "\n</style>")
html = html.replace('<script src="data/products.js"></script>', "<script>\n" + embed(data) + "\n</script>")
html = html.replace('<script src="assets/js/i18n.js"></script>', "<script>\n" + i18n + "\n</script>")
html = html.replace('<script src="assets/js/app.js"></script>', "<script>\n" + js + "\n</script>")
html = embed(html)
html = html.replace("<title>Tanjo Foods – Food for Every Moment</title>",
                    "<title>Tanjo Foods – Website Design Preview</title>")
html = html.replace('Design preview – prices, pack sizes and product details are sample values pending client confirmation.',
                    'Design preview – fully clickable, English / French. Prices and details are sample values for your confirmation. Orders placed here are not sent.')

out = os.path.join(ROOT, "preview", "Tanjo_Foods_Design_Preview.html")
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, "w", encoding="utf-8").write(html)
print("wrote", out, f"{os.path.getsize(out)/1024:.0f} KB", f"({len(cache)} images embedded)")
