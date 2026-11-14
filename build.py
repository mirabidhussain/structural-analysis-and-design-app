import re, pathlib
root = pathlib.Path(__file__).parent
html = (root/'www/index.html').read_text()
block = re.search(r'<!--SCRIPTS-->(.*?)<!--/SCRIPTS-->', html, re.S).group(1)
js = ''
for src in re.findall(r'src="([^"]+)"', block):
    js += '\n/* ' + src + ' */\n' + (root/'www'/src).read_text()
out = html.replace(block, '\n<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n')
out = re.sub(r'<link rel="(manifest|icon)"[^>]*>\n?', '', out)
(root/'dist').mkdir(exist_ok=True)
(root/'dist/index.html').write_text(out)
print('dist/index.html', len(out))
