#!/usr/bin/env python3
"""
Builds the FynHelp demo pack: a fictional client, "Sunrise Traders Private Limited", for September 2026.
Everything here is made up. Run:  python3 demo/sample-pack/make_pack.py
Writes the files next to this script. tests/unit/practice/demo-pack.test.ts checks every claim the demo script makes about them.
"""
import json, os
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
import openpyxl

OUT = os.path.dirname(os.path.abspath(__file__))
inr = lambda n: ("-" if n < 0 else "") + format_in(abs(n))

def format_in(n):
    s = f"{n:.2f}"; whole, frac = s.split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2: parts.insert(0, head[-2:]); head = head[:-2]
        if head: parts.insert(0, head)
        whole = ",".join(parts + [tail])
    return f"{whole}.{frac}"

# ── the two accounts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
# (date dd/mm/yy, narration, reference, withdrawal, deposit)
HDFC = [
 ("01/09/26","NEFT CR-SHARMA STEELS-INV 2201","N260901000123",0,350000),
 ("02/09/26","UPI-RAVI TRADERS-PAYMENT","261412345001",0,48500),
 ("03/09/26","NEFT DR-SUNON MODULAR INDIA","N260903000456",800029.21,0),
 ("05/09/26","ECS-AXIS LOAN 8801 EMI","ECS88010926",42500,0),
 ("05/09/26","ECS-AXIS LOAN 8802 EMI","ECS88020926",42500,0),
 ("05/09/26","ECS-AXIS LOAN 8803 EMI","ECS88030926",42500,0),
 ("07/09/26","CHQ DEP-KAVERI FASHIONS","CHQ004871",0,100000),
 ("08/09/26","UPI-MANOHAR CIVIL-PAYMENT","261412345002",235000,0),
 ("09/09/26","NEFT DR-SALARY SEP BATCH","N260909000789",310000,0),
 ("10/09/26","UPI-GREENFIELD AGRO-PAYMENT","261412345003",29490,0),
 ("10/09/26","UPI/RVSL261412345003-GREENFIELD","261412345903",0,29490),
 ("12/09/26","NEFT DR-SUNRISE ICICI 4411","HDFCN52609120123",500000,0),
 ("14/09/26","UPI-KIRAN LOGISTICS-PAYMENT","261412345004",0,75000),
 ("15/09/26","UPI-ASHA TRADERS-PAYMENT","261412345005",0,50000),
 ("15/09/26","UPI-SUMIT ENTERPRISES-PAYMENT","261412345006",0,50000),
 ("16/09/26","CASH DEP CDM VISAKHAPATNAM","CDM160926",0,120000),
 ("18/09/26","NEFT DR-VASUDEVA-RENT SEP","N260918000321",86100,0),
 ("19/09/26","UPI-LAKSHMI SUPPLIERS-PAYMENT","261412345007",64250,0),
 ("20/09/26","NEFT CR-UNKNOWN REMITTER","N260920000555",0,25000),
 ("22/09/26","BILLDESK-APEPDCL ELECTRICITY","BD220926",38420,0),
 ("23/09/26","UPI-RAVI AGENCIES-PAYMENT","261412345008",0,91000),
 ("25/09/26","UPI-KIRAN LOGISTICS-REFUND","261412345009",15000,0),
 ("26/09/26","TDS PAYMENT CHALLAN 281","CH260926",18400,0),
 ("28/09/26","SMS AND SERVICE CHARGES SEP","CHG0926",590,0),
 ("29/09/26","NEFT CR-SHARMA STEELS-INV 2214","N260929000987",0,410000),
 ("30/09/26","INT PD 01-09-26 TO 30-09-26","INT0926",0,1842),
]
ICICI = [
 ("12/09/26","NEFT CR-SUNRISE HDFC 5678 HDFCN52609120123","HDFCN52609120123",0,500000),
 ("14/09/26","UPI-GOPI MACHINERY-PAYMENT","261412999001",125000,0),
 ("17/09/26","NEFT CR-RAJU CONSTRUCTIONS","N260917001122",0,240000),
 ("21/09/26","ECS CHARGES-CMS","CHG2109",354,0),
 ("24/09/26","CHQ 009811 PAID","009811",60000,0),
 ("27/09/26","UPI-VENKAT AND CO-PAYMENT","261412999002",0,33000),
]
HDFC_OPEN, ICICI_OPEN = 1250000.00, 400000.00

def with_balance(opening, lines):
    bal = opening; out = []
    for d, n, r, w, c in lines:
        bal = round(bal - w + c, 2); out.append((d, n, r, w, c, bal))
    return out

def statement_pdf(path, title, acct, opening, lines, summary=True, drop=None):
    rows = with_balance(opening, lines)
    shown = [r for i, r in enumerate(rows) if i != drop]
    cv = canvas.Canvas(path, pagesize=landscape(A4)); W, H = landscape(A4)
    def head(page):
        cv.setFont("Helvetica-Bold", 10); cv.drawString(30, H-30, title); cv.drawRightString(W-30, H-30, f"Page No .: {page}")
        cv.setFont("Helvetica", 9); cv.drawString(30, H-46, f"Account No : {acct}     Statement of account From : 01/09/2026 To : 30/09/2026")
        cv.setFont("Helvetica-Bold", 8)
        for x, t in [(30,"Date"),(95,"Narration"),(285,"Chq./Ref.No."),(355,"Value Dt"),(425,"Withdrawal Amt."),(520,"Deposit Amt."),(610,"Closing Balance")]: cv.drawString(x, H-70, t)
    page = 1; y = H-86; head(page); cv.setFont("Helvetica", 8)
    for d, n, r, w, c, bal in shown:
        if y < 90: cv.showPage(); page += 1; head(page); y = H-86; cv.setFont("Helvetica", 8)
        cv.drawString(30, y, d); cv.drawString(95, y, n[:44]); cv.drawString(285, y, r); cv.drawString(355, y, d)
        if w: cv.drawRightString(500, y, format_in(w))
        if c: cv.drawRightString(595, y, format_in(c))
        cv.drawRightString(700, y, format_in(bal)); y -= 12
    if summary:
        # the bank's own summary: counts and totals of the WHOLE statement, as the bank printed it
        y -= 18; cv.setFont("Helvetica-Bold", 8); cv.drawString(30, y, "STATEMENT SUMMARY :-"); y -= 14
        for x, t in [(132,"Opening Balance"),(290,"Dr Count"),(361,"Cr Count"),(425,"Debits"),(501,"Credits"),(572,"Closing Bal")]: cv.drawString(x, y, t)
        y -= 12; cv.setFont("Helvetica", 8)
        dr = sum(1 for r in rows if r[3]); cr = sum(1 for r in rows if r[4])
        for x, t in [(144,format_in(opening)),(300,str(dr)),(373,str(cr)),(413,format_in(sum(r[3] for r in rows))),(491,format_in(sum(r[4] for r in rows))),(576,format_in(rows[-1][5]))]: cv.drawString(x, y, t)
    cv.save()
    return rows

# ── statements ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
hdfc_rows = statement_pdf(f"{OUT}/01_HDFC_Current_Sep2026.pdf", "HDFC BANK LIMITED  SUNRISE TRADERS PRIVATE LIMITED", "50200012345678", HDFC_OPEN, HDFC)
icici_rows = statement_pdf(f"{OUT}/02_ICICI_Current_Sep2026.pdf", "ICICI BANK  SUNRISE TRADERS PRIVATE LIMITED", "110805504411", ICICI_OPEN, ICICI)
# the same statement with one line missing but the bank's own summary unchanged: it must be held
statement_pdf(f"{OUT}/03_HDFC_Current_Sep2026_one_line_missing.pdf", "HDFC BANK LIMITED  SUNRISE TRADERS PRIVATE LIMITED", "50200012345678", HDFC_OPEN, HDFC, drop=8)

# ── Tally Day Book (the Excel layout Tally exports, with every ledger leg of each voucher) ─────────────────────────────────────
HB, IB = "HDFC Bank 50200012345678", "ICICI Bank 110805504411"
D = lambda s: (lambda dd, mm, yy: f"{int(dd)}-{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][int(mm)-1]}-{yy}")(*s.split("/"))
V = []  # (date, vtype, vno, [(ledger, debit, credit)])
n = 0
def v(date, typ, legs): 
    global n; n += 1; V.append((D(date), typ, str(n), legs))
v("01/09/26","Receipt",[("Sharma Steels",0,350000),(HB,350000,0)])
v("02/09/26","Receipt",[("Ravi Traders",0,48500),(HB,48500,0)])
v("03/09/26","Payment",[("Sunon Modular India Private Limited",800000,0),("Bank Charges",29.21,0),(HB,0,800029.21)])
for k in (1,2,3): v("05/09/26","Payment",[(f"Axis Bank Loan A/c 880{k}",42500,0),(HB,0,42500)])
v("07/09/26","Receipt",[("Kaveri Fashions",0,98000),(HB,98000,0)])          # the books say 98,000; the cheque was 1,00,000
v("08/09/26","Payment",[("Manohar Civil Structures",235000,0),(HB,0,235000)])
v("09/09/26","Payment",[("Salaries",310000,0),(HB,0,310000)])
v("12/09/26","Contra",[(IB,500000,0),(HB,0,500000)])
v("14/09/26","Receipt",[("Kiran Logistics",0,75000),(HB,75000,0)])
v("15/09/26","Receipt",[("Asha Traders",0,50000),(HB,50000,0)])
v("15/09/26","Receipt",[("Sumit Enterprises",0,50000),(HB,50000,0)])
v("16/09/26","Contra",[(HB,120000,0),("Cash",0,120000)])
v("18/09/26","Payment",[("Rent",86100,0),(HB,0,86100)])
v("19/09/26","Payment",[("Lakshmi Suppliers",64250,0),(HB,0,64250)])
v("22/09/26","Payment",[("Electricity Charges",38420,0),(HB,0,38420)])
v("23/09/26","Receipt",[("Ravi Agencies",0,91000),(HB,91000,0)])
v("25/09/26","Payment",[("Kiran Logistics",15000,0),(HB,0,15000)])
v("26/09/26","Payment",[("TDS Payable",18400,0),(HB,0,18400)])
v("28/09/26","Payment",[("Bank Charges",590,0),(HB,0,590)])
v("29/09/26","Receipt",[("Sharma Steels",0,410000),(HB,410000,0)])
v("30/09/26","Receipt",[("Interest Received",0,1842),(HB,1842,0)])
v("14/09/26","Payment",[("Gopi Machinery",125000,0),(IB,0,125000)])
v("17/09/26","Receipt",[("Raju Constructions",0,240000),(IB,240000,0)])
v("21/09/26","Payment",[("Bank Charges",354,0),(IB,0,354)])
v("24/09/26","Payment",[("Vasudeva Builders",60000,0),(IB,0,60000)])
v("27/09/26","Receipt",[("Venkat and Co",0,33000),(IB,33000,0)])
v("30/09/26","Payment",[("Vasudeva Builders (cheque 004512, not yet presented)",30000,0),(HB,0,30000)])   # booked, not on the statement: a timing difference
v("30/09/26","Journal",[("Depreciation",52000,0),("Plant and Machinery",0,52000)])
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Day Book"
ws.append(["SUNRISE TRADERS PRIVATE LIMITED"] + [""]*7); ws.append(["Day Book"] + [""]*7); ws.append(["1-Sep-26 to 30-Sep-26"] + [""]*7)
ws.append(["Date","Particulars","","","Vch Type","Vch No.","Debit","Credit"]); ws.append(["","","","","","","Amount","Amount"])
for date, typ, no, legs in V:
    first = True
    for led, dr, cr in legs:
        ws.append([date if first else "", led, "", "", typ if first else "", no if first else "", dr or "", cr or ""]); first = False
wb.save(f"{OUT}/04_Tally_DayBook_Sep2026.xlsx")

# ── a loan statement ────────────────────────────────────────────────────────────────────────────────────────────────────────
cv = canvas.Canvas(f"{OUT}/05_Axis_Loan_Account_Statement.pdf", pagesize=A4); W, H = A4
lines = ["AXIS BANK LTD", "Loan Account Statement", "Loan A/c No 880 123456   Borrower: SUNRISE TRADERS PRIVATE LIMITED",
         "Sanctioned amount 50,00,000.00   Rate of interest 9.25%   Outstanding principal 38,12,455.00", "",
         "Date        Particulars              Instalment (EMI)   Principal    Interest     Balance",
         "05-07-2026  EMI RECEIVED             1,02,000.00        61,400.00    40,600.00    39,38,600.00",
         "05-08-2026  EMI RECEIVED             1,02,000.00        61,800.00    40,200.00    38,76,800.00",
         "05-09-2026  EMI RECEIVED             1,02,000.00        62,345.00    39,655.00    38,12,455.00"]
y = H-50
for l in lines: cv.setFont("Helvetica", 10); cv.drawString(40, y, l); y -= 16
cv.save()

# ── GST: purchase register (books) and GSTR-2B (portal) ─────────────────────────────────────────────────────────────────────
def gstin(state, pan, ent="1"):
    base = f"{state}{pan}{ent}Z"; chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; tot = 0
    for i, ch in enumerate(base):
        v_ = chars.index(ch) * (1 if i % 2 == 0 else 2); tot += v_ // 36 + v_ % 36
    return base + chars[(36 - tot % 36) % 36]
OWN = gstin("37", "ABCDE1234F")
SUP = {k: gstin("37", p) for k, p in [("Sunon Modular India Private Limited","SUNON1234M"),("Gopi Machinery","GOPIM1234K"),("Lakshmi Suppliers","LAKSH1234S"),("Vasudeva Builders","VASUD1234B"),("Kaveri Packers","KAVER1234P"),("Ravi Agencies","RAVIA1234G")]}
# (supplier, invoice no, date, taxable, igst/cgst/sgst rate 18%)
BOOKS_INV = [("Sunon Modular India Private Limited","SM/2026/041","2026-09-03",800000),("Gopi Machinery","GM-118","2026-09-14",125000),("Lakshmi Suppliers","LS/0907","2026-09-19",64250),("Vasudeva Builders","VB-77","2026-09-18",86100),("Kaveri Packers","KP/09/12","2026-09-20",42000),("Ravi Agencies","RA-5521","2026-09-23",91000)]
PORTAL = {"Sunon Modular India Private Limited":("SM/2026/041",800000),"Gopi Machinery":("GM-118",125000),"Lakshmi Suppliers":("LS/0907",64250),"Vasudeva Builders":("VB-77",76100),"Ravi Agencies":("RA-5521",91000)}  # Kaveri Packers not filed; Vasudeva filed 76,100 not 86,100
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Purchase Register"
ws.append(["GSTIN of Supplier","Trade Name","Invoice Number","Invoice Date","Place of Supply","Taxable Value","Central Tax","State/UT Tax","Invoice Value"])
for name, no, date, tv in BOOKS_INV:
    t = round(tv*0.09, 2); ws.append([SUP[name], name, no, date, "37", tv, t, t, round(tv+2*t, 2)])
wb.save(f"{OUT}/06_Purchase_Register_Sep2026.xlsx")
b2b = []
for name, (no, tv) in PORTAL.items():
    t = round(tv*0.09, 2)
    b2b.append({"ctin": SUP[name], "trdnm": name, "inv": [{"inum": no, "dt": "05-10-2026", "val": round(tv+2*t, 2), "pos": "37", "itcavl": "Y", "itms": [{"itm_det": {"txval": tv, "camt": t, "samt": t, "iamt": 0, "csamt": 0, "rt": 18}}]}]})
json.dump({"data": {"gstin": OWN, "rtnprd": "092026", "docdata": {"b2b": b2b}}}, open(f"{OUT}/07_GSTR2B_Sep2026.json", "w"), indent=1)

print("HDFC lines", len(hdfc_rows), "closing", hdfc_rows[-1][5], "| ICICI lines", len(icici_rows), "closing", icici_rows[-1][5], "| vouchers", len(V))
