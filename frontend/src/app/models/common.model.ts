import { USTranscriptMetadata } from "./us-transcript.model";
import { InvoiceMetadata } from "./invoice.model";
import { BusinessLicenseMetadata } from "./business-license.model";

export interface FileData {
    fileDataId: string;
    documentType: string;
    metadata: string;
    createdAt: string;
    updatedAt: string;
    fileId: string;
}

export type DocumentMetadata =
    | USTranscriptMetadata
    | InvoiceMetadata
    | BusinessLicenseMetadata;

export enum DocumentType {
    TRANSCRIPT = 'Transcript',
    INVOICE = 'Invoice',
    BUSINESS_LICENSE = 'BusinessLicense'
}

// BDA blueprint names can vary slightly between minor revisions (e.g. casing
// or plural form). This map normalizes known aliases to the canonical
// DocumentType values used by the frontend router.
const DOCUMENT_TYPE_ALIASES: Record<string, DocumentType> = {
    'invoice': DocumentType.INVOICE,
    'Invoices': DocumentType.INVOICE,
    'Business-License': DocumentType.BUSINESS_LICENSE,
    'business-license': DocumentType.BUSINESS_LICENSE,
};

export function normalizeDocumentType(raw: string): string {
    return DOCUMENT_TYPE_ALIASES[raw] ?? raw;
}

export interface DisplayField {
    key: string;
    value: string;
}

export class FormatHelper {
    static formatDate(dateString: string): string {
        if (!dateString) return 'Not Available';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    static formatName(firstName: string, middleName: string, lastName: string, suffix: string): string {
        let fullName = `${firstName}`;
        if (middleName) fullName += ` ${middleName}`;
        fullName += ` ${lastName}`;
        if (suffix) fullName += ` ${suffix}`;
        return fullName;
    }
}
