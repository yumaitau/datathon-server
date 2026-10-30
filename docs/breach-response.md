# Data breach response plan (one page)

MyMob holds health information (sensitive information under the Privacy Act 1988
and the Australian Privacy Principles) on behalf of communities, which own their
data. This plan follows the Notifiable Data Breaches (NDB) scheme. It is a
datathon baseline, not a certified process.

## 1. Contain (within hours)

- Revoke affected sessions (`session` table) and rotate `BETTER_AUTH_SECRET`,
  AWS keys, the APNs key and `CRON_SECRET`.
- Disable compromised staff or provider accounts (admin portal: suspend provider).
- Preserve evidence: snapshot RDS, export `AuditLog` and `NotificationLog`.

## 2. Assess (within 30 days, as soon as practicable)

- Use `AuditLog` (every staff read of appointment data, every Elder decision and
  export) to work out what was accessed, by whom and when.
- Decide whether serious harm is likely, considering that appointment data is
  health information and that phones in community are often shared.

## 3. Notify

- If an eligible data breach: notify the OAIC and affected individuals.
- Tell the Elders of each affected community before or alongside public notice:
  the community owns the data and decides how its members are told, in
  culturally appropriate ways (in person, through Elders, in language).
- Notify partner organisations (e.g. the ACCHO that verifies Elders) and affected
  providers.

## 4. Review

- Record root cause and fixes; review with community representatives.
- Check that community scoping, carer-only health access and the minimum cell
  size held during the incident.

**Contacts:** MyMob custodian lead · community Elders (per group) · OAIC
(oaic.gov.au, 1300 363 992).
