#!/usr/bin/env python3
"""Check time slots in database"""

from models import TimeSlot
from extensions import db
from app import create_app

app = create_app()

with app.app_context():
    count = TimeSlot.query.count()
    print(f'Time slots count: {count}')

    slots = TimeSlot.query.all()
    print('Time slots:')
    for slot in slots:
        print(f'  {slot.id}: {slot.name} ({slot.status}) - sort_order: {slot.sort_order}')

    # Also check student courses to see if they have time slots
    from models import StudentCourse
    courses_with_slots = StudentCourse.query.filter(StudentCourse.time_slot.isnot(None)).limit(5).all()
    print(f'\nCourses with time slots (first 5):')
    for course in courses_with_slots:
        print(f'  {course.student_name}: {course.time_slot} on {course.course_date}')