import re, pathlib
root = pathlib.Path(__file__).parent
html = (root/'www/index.html').read_text()
block = re.search(r'<!--SCRIPTS-->(.*?)<!--/SCRIPTS-->', html, re.S).group(1)
js = ''
for src in re.findall(r'src="([^"]+)"', block):
    js += '\n/* ' + src + ' */\n' + (root/'www'/src).read_text()
out = html.replace(block, '\n<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n')
out = re.sub(r'<link rel="(manifest|icon)"[^>]*>\n?', '', out)
import base64
out = re.sub(r'url\((fonts/[\w.-]+\.woff)\)', lambda m: 'url(data:font/woff;base64,' + base64.b64encode((root/'www'/m.group(1)).read_bytes()).decode() + ')', out)
out = re.sub(r'"(aids/[\w.-]+\.png)"', lambda m: '"data:image/png;base64,' + base64.b64encode((root/'www'/m.group(1)).read_bytes()).decode() + '"', out)
(root/'dist').mkdir(exist_ok=True)
(root/'dist/index.html').write_text(out)
print('dist/index.html', len(out))
