import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { getUrl } from 'aws-amplify/storage';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FileData, DocumentType, DisplayField, normalizeDocumentType } from '../../models/common.model';
import { USTranscriptHelper, USTranscriptMetadata, USTranscriptSection } from '../../models/us-transcript.model';
import { InvoiceHelper, InvoiceMetadata, InvoiceSection } from '../../models/invoice.model';
import { BusinessLicenseHelper, BusinessLicenseMetadata, BusinessLicenseSection } from '../../models/business-license.model';
import { ApiService, FileRecord, FileDataRecord } from '../../services/api.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-review-detail',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatDividerModule],
  templateUrl: './review-detail.component.html',
  styleUrl: './review-detail.component.css'
})
export class ReviewDetailComponent implements OnInit {
  file: FileRecord | null = null;
  fileUrl: string = '';
  fileData: FileData | null = null;
  parsedMetadata: USTranscriptMetadata | InvoiceMetadata | BusinessLicenseMetadata | null = null;
  safeUrl: SafeResourceUrl | undefined;
  showIframe: boolean = false;
  showPreview: boolean = false;

  constructor(private router: Router, private route: ActivatedRoute, private sanitizer: DomSanitizer) {}

  async ngOnInit() {
    const fileId = this.route.snapshot.paramMap.get('fileId');
    if (!fileId) { this.router.navigate(['/']); return; }
    try {
      this.file = await ApiService.getFile(fileId);
      if (this.file?.fileId) {
        const fileDataRecord = await ApiService.getFileDataByFileId(this.file.fileId);
        if (fileDataRecord) {
          this.fileData = {
            fileDataId: fileDataRecord.fileDataId,
            documentType: normalizeDocumentType(fileDataRecord.documentType || ''),
            metadata: fileDataRecord.metadata || '',
            createdAt: fileDataRecord.createdAt || '',
            updatedAt: fileDataRecord.updatedAt || '',
            fileId: fileDataRecord.fileId || '',
          };
        }
      }
      if (this.file?.inputPathPrefix) {
        const linkToStorageFile = await getUrl({ path: this.file.inputPathPrefix });
        this.fileUrl = linkToStorageFile.url.toString();
      }
    } catch (error) {
      console.error('Error fetching file details');
      this.router.navigate(['/']);
    }
  }

  processingTime(): string {
    if (!this.file?.updatedAt || !this.file?.createdAt) return '';
    const diffInMs = new Date(this.file.updatedAt).getTime() - new Date(this.file.createdAt).getTime();
    return `${Math.floor(diffInMs / 1000)} seconds`;
  }

  getMetadataSections(): string[] {
    if (!this.parsedMetadata) {
      try { this.parsedMetadata = JSON.parse(this.fileData?.metadata || ''); }
      catch (e) { return []; }
    }
    switch (this.fileData?.documentType) {
      case DocumentType.TRANSCRIPT: return Object.values(USTranscriptSection);
      case DocumentType.INVOICE: return Object.values(InvoiceSection);
      case DocumentType.BUSINESS_LICENSE: return Object.values(BusinessLicenseSection);
      default: return [];
    }
  }

  getFieldsForSection(section: string): Array<{key: string, value: string}> {
    if (!this.parsedMetadata) return [];
    switch (this.fileData?.documentType) {
      case DocumentType.TRANSCRIPT:
        return USTranscriptHelper.getFieldsBySection(this.parsedMetadata as USTranscriptMetadata, section);
      case DocumentType.INVOICE:
        return InvoiceHelper.getFieldsBySection(this.parsedMetadata as InvoiceMetadata, section);
      case DocumentType.BUSINESS_LICENSE:
        return BusinessLicenseHelper.getFieldsBySection(this.parsedMetadata as BusinessLicenseMetadata, section);
      default: return [];
    }
  }

  getDocumentTypeLabel(): string {
    if (!this.fileData?.documentType) return 'Unknown';
    switch (this.fileData.documentType) {
      case DocumentType.INVOICE: return 'Invoice';
      case DocumentType.TRANSCRIPT: return 'High School Transcript';
      case DocumentType.BUSINESS_LICENSE: return 'Business License';
      default: return this.fileData.documentType;
    }
  }

  formatKey(key: string): string {
    return key.replace(/---/g, '');
  }

  /**
   * Sections with nested repeating records (invoice line items, transcript courses)
   * need full-width rendering so the grouped headers and their rows stay visually
   * connected and don't get split across columns.
   */
  isFullWidthSection(section: string): boolean {
    const fullWidth: string[] = [
      InvoiceSection.LINE_ITEMS,
      USTranscriptSection.COURSE_INFO,
    ];
    return fullWidth.includes(section);
  }

  loadContent(path: string) {
    if (!this.isAllowedUrl(path)) return;
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(path);
    this.showIframe = true;
  }

  /**
   * Validates that a URL is safe to load in an iframe.
   * Only allows HTTPS URLs from trusted AWS domains (S3 pre-signed URLs).
   */
  private isAllowedUrl(url: string): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      // Allow only S3 pre-signed URLs (the only expected source for document previews)
      const allowedHostPatterns = [
        /^.+\.s3\.amazonaws\.com$/,
        /^.+\.s3\..+\.amazonaws\.com$/,
        /^s3\..+\.amazonaws\.com$/,
      ];
      return allowedHostPatterns.some(pattern => pattern.test(parsed.hostname));
    } catch {
      return false;
    }
  }

  navigateToHome() {
    this.router.navigate(['/review']);
  }
}
