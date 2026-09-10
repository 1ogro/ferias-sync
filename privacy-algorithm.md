# Conservative Deterministic Cell Privacy Algorithm

## 1. Definitions and Visibility Predicates

Let:
- (T, K, W)$ = Population count for Team $, Kind $, Week $.
- (T, K, W)$ = Visibility of the primitive cell $.
- {Team}(T, W)$ = Visibility of the team-wide average for week $.
- {Global}(K, W)$ = Visibility of the global average for kind $, week $.

### A. Weekly Base Primitive (Team-Kind)
A cell $ is visible if and only if **all** kinds for that team in that week meet the threshold.
16152V(T, K, W) = \bigwedge_{k \in Kinds} (N(T, k, W) \ge 3)16152
*Rationale: Prevents linear deduction of a small kind cell by subtracting other public kind cells from a public team total.*

### B. Weekly Team Combined (Total Team Average)
A team total for week $ is visible if the aggregate team size meets the threshold.
16152V_{Team}(T, W) = (\sum_{k \in Kinds} N(T, k, W) \ge 3)16152
*Rationale: Aggregation provides safety even when sub-components are sparse, provided the sub-components are not individually disclosed.*

### C. Weekly Global Kind Average
A global average for kind $ is visible if the "Hidden Union" (sum of counts of all suppressed team-kind cells for that kind) is either zero or $\ge 3$.
16152V_{Global}(K, W) = (\sum_{T: \neg V(T, K, W)} N(T, K, W) \ge 3) \lor (\forall T, V(T, K, W))16152
*Rationale: Prevents deducing a suppressed team's value by subtracting all visible teams from the global total.*

### D. Period Aggregates (Monthly/Quarterly)
A period aggregate for any scope (Team, Kind, or Global) is visible if and only if **every** contributing weekly cell for that specific scope/kind was public.
16152V_{Period}(Scope, Kind, \text{Weeks}) = \bigwedge_{w \in \text{Weeks}} V_{Weekly}(Scope, Kind, w)16152
*Rationale: Prevents differencing attacks across overlapping or adjacent time windows where a single hidden week could be isolated.*

## 2. SQL Predicate Implementation (T-SQL/PostgreSQL)

```sql
WITH TeamKindStats AS (
    SELECT team_id, kind, week_id, 
           COUNT(*) as n, 
           AVG(score) as raw_avg
    FROM wellbeing_raw
    GROUP BY team_id, kind, week_id
),
TeamVisibility AS (
    SELECT *,
           -- Rule A: Check if ALL kinds in this team/week are >= 3
           MIN(n) OVER (PARTITION BY team_id, week_id) >= 3 as primitive_safe,
           -- Rule B: Check if team total >= 3
           SUM(n) OVER (PARTITION BY team_id, week_id) >= 3 as team_total_safe
    FROM TeamKindStats
),
GlobalVisibility AS (
    SELECT kind, week_id,
           -- Rule C: Global is safe if sum of hidden n is >= 3 or no cells hidden
           (SUM(CASE WHEN NOT primitive_safe THEN n ELSE 0 END) >= 3 
            OR COUNT(CASE WHEN NOT primitive_safe THEN 1 END) = 0) as global_safe
    FROM TeamVisibility
    GROUP BY kind, week_id
)
-- Final Output logic would apply these flags to suppress 'raw_avg'
```

## 3. Risk Assessment

1.  **Attribute Disclosure**: While values are hidden, the *fact* of suppression reveals that the population  < 3$. In small organizations, this itself may be sensitive information (e.g., revealing that only 1-2 people in a specific team are active).
2.  **Conservative Suppression Bias**: The "Period Aggregates" rule is highly restrictive. If a single week fails the threshold, the entire month is suppressed. This may lead to significant data loss but is the only way to ensure deterministic safety without complex differential privacy noise.
3.  **Low Diversity Leakage**: If a team of 3 all report the exact same "Wellbeing" score, the average is their individual score. This algorithm protects against *identity deduction* but not necessarily *attribute prediction* if the group is perfectly homogeneous.

## 4. Rigorous Safe Sufficient Condition

**Condition**: *For any aggregate result $ derived from a set of records $, $ is published only if the set of records  \setminus \bigcup (\text{Visible Sub-aggregates of } A)$ is either empty or has a cardinality $|R'| \ge K$ (where =3$).*

This ensures that no individual or small group ($< 3$) can ever be isolated by subtracting known subsets from the target aggregate.
