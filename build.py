import re, pathlib
root = pathlib.Path(__file__).parent
html = (root/'www/index.html').read_text()
block = re.search(r'<!--SCRIPTS-->(.*?)<!--/SCRIPTS-->', html, re.S).group(1)
js, eng = '', ''
for src, ed in re.findall(r'<script src="([^"]+)"( data-eng)?></script>', block):
    t = '\n/* ' + src + ' */\n' + (root/'www'/src).read_text()
    if ed: eng += t
    else: js += t
# engine in its own block: the background workers are started from this text (no extra files needed offline)
out = html.replace(block, '\n<script id="isd-engine">\n' + eng.replace('</script', '<\\/script') + '\n</script>\n<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n')
out = re.sub(r'<link rel="(manifest|icon)"[^>]*>\n?', '', out)
import base64
out = re.sub(r'url\((fonts/[\w.-]+\.woff)\)', lambda m: 'url(data:font/woff;base64,' + base64.b64encode((root/'www'/m.group(1)).read_bytes()).decode() + ')', out)
out = re.sub(r'"(aids/[\w.-]+\.png)"', lambda m: '"data:image/png;base64,' + base64.b64encode((root/'www'/m.group(1)).read_bytes()).decode() + '"', out)
MIME = {'png': 'image/png', 'jpg': 'image/jpeg'}
def durl(name): return 'data:' + MIME[name.rsplit('.', 1)[1]] + ';base64,' + base64.b64encode((root/'www'/name).read_bytes()).decode()
out = re.sub(r'url\((brand-banner\.jpg)\)', lambda m: 'url(' + durl(m.group(1)) + ')', out)
out = re.sub(r'(["\'])(logo-mark(?:-128)?\.png)\1', lambda m: m.group(1) + durl(m.group(2)) + m.group(1), out)
(root/'dist').mkdir(exist_ok=True)
(root/'dist/index.html').write_text(out)
print('dist/index.html', len(out))
