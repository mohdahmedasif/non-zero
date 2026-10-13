-- Optional monthly rule on top of the weekdays: NULL = every week,
-- 1 to 4 = that occurrence of the weekday in the month, -1 = the last one.
ALTER TABLE habits ADD COLUMN month_week INTEGER;
