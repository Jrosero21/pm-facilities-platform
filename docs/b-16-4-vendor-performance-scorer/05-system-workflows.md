# B-16.4 — System Workflows

## Compute path (two-pass)
computeVendorPerformanceScores(tenantId)

↓ resolve status ids by CODE (WORK_COMPLETE, ON_SITE) from dispatch_assignment_statuses

↓ read all job_vendor_assignments for the tenant (id, vendor_id, matched_trade_id,
  current_status_id, scheduled_start_at)

↓ ARRIVAL timestamps for completed assignments (COALESCE, two sources):
   1. earliest vendor_check_ins.occurred_at  (the direct arrival record)
   2. fallback: earliest On-Site transition — job_vendor_assignment_status_history.created_at
      where to_status_id = ON_SITE  (when no check-in exists)

↓ PASS 1 — per (vendor_id, matched_trade_id) accumulate:
   total     = count of dispatches in the group
   completed = count where current_status_id = WORK_COMPLETE
   onTime    = count of completed where arrival <= scheduled_start_at
   raw completion = completed / total      (declines + cancels in the denominator)
   raw on-time    = onTime / completed

↓ population means (UNWEIGHTED across groups): popMeanCompletion, popMeanOnTime

↓ PASS 2 — shrinkage + composite:
   shrunk(rate) = (n*rate + K*popMean) / (n + K)        K = 5, n = total
   score = (0.7*shrunkCompletion + 0.3*shrunkOnTime) * 100

↓ idempotent WRITE (in a tx):
   DELETE vendor_performance_scores WHERE tenant_id = tenantId
   INSERT one row per (vendor, trade): total_dispatches, jobs_completed, jobs_on_time,
     completion_rate, on_time_rate, score, avg_rating=null, computed_at, status='active'

## Read path (operator chatbot)
summarizeVendorPerformance(vendorId)  [tenant captured in the tool closure]

↓ getVendor(tenantId, vendorId)  — not found → { found:false }

↓ getVendorPerformanceScores(tenantId, vendorId)  → per-(vendor,trade) rows

↓ if rows exist: dispatch-weighted rollup → { overallScore, completionRate, onTimeRate,
     totalDispatches, byTrade[] }  + "computed from dispatch history" note

↓ else: performance = null + the profile-only fallback note

## Source/target tables
- Reads: job_vendor_assignments, job_vendor_assignment_status_history, vendor_check_ins,
  dispatch_assignment_statuses.
- Writes: vendor_performance_scores (per vendor × trade).
