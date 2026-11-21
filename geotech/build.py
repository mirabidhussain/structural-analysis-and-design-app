"""Build a single self-contained HTML of IS GeoTech (scripts and icon inlined) → ../dist-geotech/index.html"""
import base64, os, re
here = os.path.dirname(os.path.abspath(__file__)); www = os.path.join(here, "www"); out = os.path.join(here, "..", "dist-geotech")
html = open(os.path.join(www, "index.html"), encoding="utf-8").read()
icon = "data:image/png;base64," + base64.b64encode(open(os.path.join(www, "icon-192.png"), "rb").read()).decode()
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', "").replace('href="icon-192.png"', 'href="' + icon + '"').replace('src="icon-192.png"', 'src="' + icon + '"')
def inline(m):
    js = open(os.path.join(www, m.group(1)), encoding="utf-8").read().replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
os.makedirs(out, exist_ok=True)
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)
print("dist-geotech/index.html", len(html))
