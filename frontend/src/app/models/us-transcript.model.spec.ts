import {
  USTranscriptHelper,
  USTranscriptMetadata,
  USTranscriptSection,
} from './us-transcript.model';

const mockMetadata: USTranscriptMetadata = {
  student_name: 'Penelope P. Puddingpop',
  student_birthdate: '2005-09-20',
  student_gender: 'Female',
  student_address: '456 Oak Avenue, Whimsy Harbor, IL',
  school_name: 'Whimsy Harbor High School',
  school_address: '789 Elm Avenue, Whimsy Harbor, IL',
  courses: [
    { course_name: 'Algebra II', credits: '1.0', grade: 'A', grade_level: 'Grade 11', academic_year: '2022-2023' },
    { course_name: 'English 11', credits: '..', grade: '**', grade_level: 'Grade 11', academic_year: '2022-2023' },
    { course_name: 'Geometry', credits: '1.0', grade: 'B+', grade_level: 'Grade 10', academic_year: '2021-2022' },
  ],
};

describe('USTranscriptHelper', () => {
  describe('Student Information', () => {
    it('should return student info fields', () => {
      const fields = USTranscriptHelper.getFieldsBySection(
        mockMetadata,
        USTranscriptSection.STUDENT_INFO,
      );
      expect(fields.length).toBe(4);
      expect(fields[0]).toEqual({ key: 'Name', value: 'Penelope P. Puddingpop' });
      expect(fields[1]).toEqual({ key: 'Birth Date', value: '2005-09-20' });
      expect(fields[2]).toEqual({ key: 'Gender', value: 'Female' });
      expect(fields[3]).toEqual({
        key: 'Address',
        value: '456 Oak Avenue, Whimsy Harbor, IL',
      });
    });
  });

  describe('School Information', () => {
    it('should return school info fields', () => {
      const fields = USTranscriptHelper.getFieldsBySection(
        mockMetadata,
        USTranscriptSection.SCHOOL_INFO,
      );
      expect(fields.length).toBe(2);
      expect(fields[0].value).toBe('Whimsy Harbor High School');
      expect(fields[1].value).toBe('789 Elm Avenue, Whimsy Harbor, IL');
    });
  });

  describe('Course Information', () => {
    it('groups courses by grade level and emits subject-row headers', () => {
      const fields = USTranscriptHelper.getFieldsBySection(
        mockMetadata,
        USTranscriptSection.COURSE_INFO,
      );
      // 2 group headers + 3 course rows
      expect(fields.length).toBe(5);
      // Headers are wrapped in --- markers so the UI renders them as subject rows
      const headers = fields.filter((f) => f.key.startsWith('---'));
      expect(headers).toHaveLength(2);
      expect(headers.map((h) => h.key)).toEqual([
        '---Grade 11 · 2022-2023---',
        '---Grade 10 · 2021-2022---',
      ]);
    });

    it('counts courses per group in the header value', () => {
      const fields = USTranscriptHelper.getFieldsBySection(
        mockMetadata,
        USTranscriptSection.COURSE_INFO,
      );
      const g11 = fields.find((f) => f.key === '---Grade 11 · 2022-2023---');
      const g10 = fields.find((f) => f.key === '---Grade 10 · 2021-2022---');
      expect(g11?.value).toBe('2 courses');
      expect(g10?.value).toBe('1 course');
    });

    it('formats each course row with credits and grade', () => {
      const fields = USTranscriptHelper.getFieldsBySection(
        mockMetadata,
        USTranscriptSection.COURSE_INFO,
      );
      const algebra = fields.find((f) => f.key === 'Algebra II');
      expect(algebra?.value).toBe('1.0 credits · Grade A');
    });

    it('replaces ".." credits with "N/A" and "**" grade with "In Progress"', () => {
      const fields = USTranscriptHelper.getFieldsBySection(
        mockMetadata,
        USTranscriptSection.COURSE_INFO,
      );
      const english = fields.find((f) => f.key === 'English 11');
      expect(english?.value).toBe('N/A credits · Grade In Progress');
    });

    it('falls back to a single ungrouped list when grade_level and academic_year are missing', () => {
      const ungrouped: USTranscriptMetadata = {
        ...mockMetadata,
        courses: [
          { course_name: 'Biology', credits: '1.0', grade: 'A', grade_level: '', academic_year: '' },
          { course_name: 'Art', credits: '0.5', grade: 'A', grade_level: '', academic_year: '' },
        ],
      };
      const fields = USTranscriptHelper.getFieldsBySection(
        ungrouped,
        USTranscriptSection.COURSE_INFO,
      );
      // No subject-row headers, just the 2 course rows
      expect(fields.filter((f) => f.key.startsWith('---'))).toHaveLength(0);
      expect(fields).toHaveLength(2);
    });

    it('should return empty array when no courses', () => {
      const noCourses = { ...mockMetadata, courses: [] };
      const fields = USTranscriptHelper.getFieldsBySection(
        noCourses,
        USTranscriptSection.COURSE_INFO,
      );
      expect(fields).toEqual([]);
    });
  });

  describe('unknown section', () => {
    it('should return empty array', () => {
      expect(
        USTranscriptHelper.getFieldsBySection(mockMetadata, 'Unknown'),
      ).toEqual([]);
    });
  });
});
