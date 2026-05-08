import { DisplayField } from "./common.model";

export interface USTranscriptCourse {
    course_name: string;
    credits: string;
    grade: string;
    grade_level: string;
    academic_year: string;
}

export interface USTranscriptMetadata {
    courses: USTranscriptCourse[];
    school_address: string;
    school_name: string;
    student_address: string;
    student_birthdate: string;
    student_gender: string;
    student_name: string;
}

export enum USTranscriptSection {
    STUDENT_INFO = 'Student Information',
    SCHOOL_INFO = 'School Information',
    COURSE_INFO = 'Course Information'
}

export class USTranscriptHelper {
    private static readonly PLACEHOLDER = {
        NOT_AVAILABLE: 'N/A',
        IN_PROGRESS: 'In Progress',
        DOTS: '..',
        ASTERISKS: '**'
    } as const;

    static getFieldsBySection(metadata: USTranscriptMetadata, section: string): DisplayField[] {
        switch (section) {
            case USTranscriptSection.STUDENT_INFO:
                return this.getStudentInformation(metadata);
            case USTranscriptSection.SCHOOL_INFO:
                return this.getSchoolInformation(metadata);
            case USTranscriptSection.COURSE_INFO:
                return this.getCourseInformation(metadata);
            default:
                return [];
        }
    }

    private static getStudentInformation(metadata: USTranscriptMetadata): DisplayField[] {
        return [
            { key: 'Name', value: metadata.student_name },
            { key: 'Birth Date', value: metadata.student_birthdate },
            { key: 'Gender', value: metadata.student_gender },
            { key: 'Address', value: metadata.student_address }
        ];
    }

    private static getSchoolInformation(metadata: USTranscriptMetadata): DisplayField[] {
        return [
            { key: 'School Name', value: metadata.school_name },
            { key: 'School Address', value: metadata.school_address }
        ];
    }

    /**
     * Groups courses by grade_level (+ academic_year when present), emitting a
     * subject-row header per group followed by one row per course. The `---`
     * markers trigger subject-row styling in review-detail.component.html;
     * formatKey() strips them before display.
     */
    private static getCourseInformation(metadata: USTranscriptMetadata): DisplayField[] {
        if (!metadata.courses?.length) {
            return [];
        }

        const groups = new Map<string, USTranscriptCourse[]>();
        for (const course of metadata.courses) {
            const key = this.buildGroupKey(course);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(course);
        }

        const result: DisplayField[] = [];
        for (const [groupLabel, courses] of groups) {
            if (groupLabel) {
                result.push({
                    key: `---${groupLabel}---`,
                    value: `${courses.length} course${courses.length === 1 ? '' : 's'}`
                });
            }
            for (const course of courses) {
                result.push({
                    key: course.course_name || 'Unknown Course',
                    value: `${this.formatValue(course.credits)} credits · Grade ${this.formatValue(course.grade)}`
                });
            }
        }
        return result;
    }

    private static buildGroupKey(course: USTranscriptCourse): string {
        const level = course.grade_level?.trim();
        const year = course.academic_year?.trim();
        if (level && year) return `${level} · ${year}`;
        if (level) return level;
        if (year) return year;
        return '';
    }

    private static formatValue(value: string): string {
        if (value === this.PLACEHOLDER.DOTS) return this.PLACEHOLDER.NOT_AVAILABLE;
        if (value === this.PLACEHOLDER.ASTERISKS) return this.PLACEHOLDER.IN_PROGRESS;
        return value || this.PLACEHOLDER.NOT_AVAILABLE;
    }
}
