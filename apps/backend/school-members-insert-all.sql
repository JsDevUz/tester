INSERT INTO school_members (school_id, student_id, role)
SELECT '3ad69cdd-4a99-4044-890c-5323df0584c1', u.id, 'student'
FROM users u
WHERE u.role = 'student'
ON CONFLICT (school_id, student_id) DO NOTHING;
