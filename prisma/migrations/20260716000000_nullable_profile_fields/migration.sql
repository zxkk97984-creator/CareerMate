-- 清理历史假默认值：将空字符串和 0 替换为 NULL，不影响真实用户数据
-- educationStage: 空字符串 → NULL（只清空字符串，不碰真实值如 "senior"/"junior"）
UPDATE "UserProfile" SET "educationStage" = NULL WHERE "educationStage" = '';
-- targetRole: 空字符串 → NULL
UPDATE "UserProfile" SET "targetRole" = NULL WHERE "targetRole" = '';
-- targetRoleLabel: 空字符串 → NULL
UPDATE "UserProfile" SET "targetRoleLabel" = NULL WHERE "targetRoleLabel" = '';
-- weeklyAvailableHours: 0 → NULL（只清 0，不碰真实值如 9/10/20）
UPDATE "UserProfile" SET "weeklyAvailableHours" = NULL WHERE "weeklyAvailableHours" = 0;
