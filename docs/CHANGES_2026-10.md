# Client changes – October 2026 (branch `uat`)

| # | Change | Where |
|---|---|---|
| 1 | Kitchen can **send an indent back** when stock is short (available qty + note per item, message to branch). Branch sees it under **Indents → Needs change** (and on Home), changes quantities / removes / adds items and sends it again. New status **Q – Changes requested**. | Indent detail (kitchen: *Send back*; branch: *Send to kitchen again*) |
| 2 | **Invoice only after receipt.** Kitchen dispatches right after accepting. After the branch confirms receipt, head office opens **Indents → To invoice**, sets tax / terms / charges and clicks *Finalize and issue invoice*. New status **I – Invoiced**. | Indents → To invoice; Admin Home alert |
| 3 | **Packing slip** (items, quantities, batch numbers, no prices) for every dispatched indent – branches and external customers. Invoice follows receipt as in 2. | Indent detail → *Packing slip* |
| 4 | **Batch number** = kitchen code + product code + Julian day + 2-digit year + 3-digit daily serial (per kitchen), e.g. `CKC6529926001`. Older batches keep their number. | Batches |
| 5 | **Stock not enforced at dispatch.** Without enough batch stock the kitchen gets a warning and can still dispatch; the uncovered quantity is recorded as `NO BATCH` (shown on packing slip and invoice). | Dispatch |
| 6 | Indent item picker: **A–Z order**, search by part of the name or the code. | New indent / Needs change |
| 7 | Product Master: **search** (name / code / id) and **kitchen filter**; unit (UOM) now shows even if capitals differ. | Master → Product |
| 8 | Indent items are **limited to the selected kitchen's products** (producing kitchen). Changing the kitchen clears the items (with a warning). Also checked on the server. | New indent |

Status flow: `C` requested → (`Q` changes requested → `C`) → `A` accepted → `D` dispatched → `R` received → `I` invoiced.
Old `F` (finalized before dispatch) indents are moved back to `A` by the migration; old received indents that already have an invoice become `I`.

## Deploy to the server (pm.thanjaicaterers.com)

```bash
cd ~/backups && TS=$(date +%Y%m%d_%H%M) && sudo mysqldump --single-transaction --routines --triggers thanjai_restaurant > thanjai_before_oct26_$TS.sql && chmod 600 *.sql && ls -lh | tail -2
cd ~/code/thanjai_api && git pull && git log --oneline -1
npm ci --omit=dev && node migrations/run.js && sudo systemctl restart TR && sleep 4 && \
sudo systemctl status TR --no-pager | head -5 && curl -s -o /dev/null -w "local check: %{http_code}\n" http://localhost:4002/v1/
```
Expected migration lines: `010_indent_change_requests: added kitchen_note, …` and `010_invoice_after_receipt: …`.

After deploy: press Ctrl+F5 in the browser. If kitchen users should create batches themselves, give the Kitchen role **Batches – Edit** in Master → Role.

Rollback: `git checkout decd84e && npm ci --omit=dev && sudo systemctl restart TR`, then restore the backup taken above.
