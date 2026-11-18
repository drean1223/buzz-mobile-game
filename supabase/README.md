# Supabase（ランキングと計測）

プロジェクト: `hoshineko-jump`（東京リージョン・無料プラン）

## しくみ

- テーブル `daily_scores`（1人1日1行・その日のベスト）と `sessions`（1訪問1行の匿名統計）。
  どちらも RLS 有効・ポリシーなしで、ブラウザから直接は読み書きできません。
- ブラウザが呼べるのは次の関数だけです（公開キーで呼び出し）。
  - `daily_top(day, limit)` … その日の上位
  - `daily_me(day, player)` … 自分の順位と人数
  - `track_session(json)` … 訪問ごとのプレイ回数など（値は上限で切り詰め）
- スコアの書き込みは edge function `submit-score` だけ。リプレイをゲームと同じコードで再生して、
  サーバーが計算した点数を `submit_daily`（service role 専用）で保存します。
- スキーマは `migrations/` にあります。

## よく見る数字（SQL エディタで）

```sql
-- 日別: 訪問数、初訪問、1人あたりプレイ数、シェアした訪問の割合
select date(started_at at time zone 'Asia/Tokyo') as day,
       count(*) as visits,
       count(*) filter (where first_visit) as new_players,
       round(avg(plays), 1) as plays_per_visit,
       round(100.0 * count(*) filter (where shares > 0) / count(*), 1) as share_pct,
       round(avg(seconds) / 60.0, 1) as minutes
from sessions group by 1 order by 1 desc;

-- 流入元（challenge = 友だちの勝負リンク）
select source, count(*), round(avg(plays), 1) as plays
from sessions where started_at > now() - interval '7 days'
group by 1 order by 2 desc;

-- 翌日も来た人の割合（初訪問の日ごと）
with f as (select player_id, min(date(started_at at time zone 'Asia/Tokyo')) d from sessions group by 1)
select f.d, count(*) as players,
       round(100.0 * count(*) filter (where exists (
         select 1 from sessions s where s.player_id = f.player_id
           and date(s.started_at at time zone 'Asia/Tokyo') = f.d + 1)) / count(*), 1) as day1_pct
from f group by 1 order by 1 desc;
```
