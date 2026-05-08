import { DisplayField, FormatHelper } from "./common.model";

// Custom BDA BusinessLicense blueprint. Public-record data issued by state
// and local government agencies (SLG use case). All fields optional so the
// helper degrades gracefully when BDA leaves a field blank.
export interface BusinessLicenseMetadata {
    license_number?: string;
    license_type?: string;
    license_status?: string;
    business_name?: string;
    dba_name?: string;
    business_address?: string;
    business_phone?: string;
    naics_code?: string;
    owner_name?: string;
    issuing_authority?: string;
    issue_date?: string;
    expiration_date?: string;
}

export enum BusinessLicenseSection {
    LICENSE_INFO = 'License Information',
    BUSINESS_INFO = 'Business Information'
}

export class BusinessLicenseHelper {
    private static readonly NOT_AVAILABLE = 'Not Available';

    static getFieldsBySection(metadata: BusinessLicenseMetadata, section: string): DisplayField[] {
        switch (section) {
            case BusinessLicenseSection.LICENSE_INFO:
                return [
                    { key: 'License Number', value: metadata.license_number || this.NOT_AVAILABLE },
                    { key: 'License Type', value: metadata.license_type || this.NOT_AVAILABLE },
                    { key: 'Status', value: metadata.license_status || this.NOT_AVAILABLE },
                    { key: 'Issuing Authority', value: metadata.issuing_authority || this.NOT_AVAILABLE },
                    { key: 'Issue Date', value: FormatHelper.formatDate(metadata.issue_date || '') },
                    { key: 'Expiration Date', value: FormatHelper.formatDate(metadata.expiration_date || '') }
                ];

            case BusinessLicenseSection.BUSINESS_INFO:
                return [
                    { key: 'Business Name', value: metadata.business_name || this.NOT_AVAILABLE },
                    { key: 'DBA Name', value: metadata.dba_name || this.NOT_AVAILABLE },
                    { key: 'Business Address', value: metadata.business_address || this.NOT_AVAILABLE },
                    { key: 'Business Phone', value: metadata.business_phone || this.NOT_AVAILABLE },
                    { key: 'NAICS Code', value: metadata.naics_code || this.NOT_AVAILABLE },
                    { key: 'Owner / Principal', value: metadata.owner_name || this.NOT_AVAILABLE }
                ];

            default:
                return [];
        }
    }
}
