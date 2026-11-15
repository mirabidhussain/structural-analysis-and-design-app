"""LibreOffice computes every formula of the workbooks written by xlsx_ci.js (they carry no cached values);
the results must have no Excel errors and must equal the values the app computed."""
import json, subprocess, sys, os, glob, tempfile
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'xci')
bad = 0
for f in sorted(glob.glob(os.path.join(d, '*.xlsx'))):
    exp = json.load(open(f[:-5] + '.json'))
    o = tempfile.mkdtemp()
    subprocess.run(['soffice', '--headless', '--norestore', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', o, f], check=True, capture_output=True, timeout=600)
    wb = load_workbook(os.path.join(o, os.path.basename(f)), data_only=True)
    errs = mism = 0; ex = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith('#') and c.value.rstrip('!?/0').upper() in ('#VALUE', '#REF', '#NAME', '#DIV', '#N/A', '#NUM', '#NULL'):
                    errs += 1; ex.append((ws.title, c.coordinate, c.value))
    for sh, ci, r, v in exp:
        w = wb[sh][get_column_letter(ci + 1) + str(r)].value
        if isinstance(v, (int, float)):
            ok = isinstance(w, (int, float)) and abs(v - w) <= 1e-6 * max(1.0, abs(v)) * 1000 and (abs(v - w) <= 1e-3 * max(1e-9, abs(v)) or abs(v - w) < 1e-6)
        else:
            ok = (w == v) or (v in ('', None) and w in ('', None))
        if not ok:
            mism += 1
            if len(ex) < 12: ex.append((sh, get_column_letter(ci + 1) + str(r), v, w))
    print(f'{os.path.basename(f)}: {len(exp)} formulas checked, {errs} errors, {mism} mismatches')
    for e in ex[:12]: print('   ', e)
    bad += errs + mism
sys.exit(1 if bad else 0)
