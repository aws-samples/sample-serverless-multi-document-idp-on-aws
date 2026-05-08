import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { uploadData } from 'aws-amplify/storage';
import { getCurrentUser } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';
import { ApiService, FileRecord } from '../services/api.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent {
  // Client-side upload limit. The backend Lambda (infra/lambda/process-s3-input/handler.ts)
  // enforces a larger 5 MB ceiling; the smaller client-side limit exists to give users
  // fast feedback without a round-trip and to make deliberately oversize uploads unusual.
  // If this value changes, also update the Lambda's MAX_FILE_SIZE_BYTES and the
  // 2 MB / 5 MB references in README.md, TROUBLESHOOTING.md, CHANGELOG.md,
  // and .kiro/steering/product.md.
  private static readonly MAX_UPLOAD_SIZE_MB = 2;
  private static readonly MAX_UPLOAD_SIZE_BYTES =
    UploadComponent.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

  readonly maxFileSizeMb = UploadComponent.MAX_UPLOAD_SIZE_MB;

  selectedFile: File | null = null;
  selectedFileId: string = '';
  fileUploadStatus = false;
  isProcessing = false;
  isFileTooLarge = false;
  errorMessage: string | null = null;
  fileUpload: FileRecord | null = null;
  private allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
  private allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'];
  loginId: string | undefined = undefined;

  constructor(private router: Router) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isValidType = this.allowedTypes.includes(file.type) || this.allowedExtensions.includes(ext);

      if (!isValidType) {
        this.errorMessage = 'Unsupported file type. Please upload PDF, PNG, JPEG, or TIFF files.';
        this.selectedFile = null;
        this.isFileTooLarge = false;
      } else if (file.size > UploadComponent.MAX_UPLOAD_SIZE_BYTES) {
        this.isFileTooLarge = true;
        this.errorMessage = `File size exceeds ${this.maxFileSizeMb} MB limit`;
        this.selectedFile = null;
      } else {
        this.isFileTooLarge = false;
        this.errorMessage = '';
        this.selectedFile = file;
      }
    }
  }

  async uploadFile() {
    if (!this.selectedFile) return;
    this.isProcessing = true;
    this.errorMessage = null;
    try {
      this.selectedFileId = uuidv4();
      this.loginId = await this.getUserAndValidate();
      const result = await this.uploadToStorage(this.loginId);
      await this.createFileUploadRecord(this.loginId, result);
    } catch (error) {
      await this.handleError(error);
    } finally {
      this.isProcessing = false;
      this.router.navigate(['/review']);
    }
  }

  private async getUserAndValidate() {
    return (await getCurrentUser()).signInDetails?.loginId;
  }

  private async uploadToStorage(_username: string | undefined) {
    return await uploadData({
      data: this.selectedFile!,
      path: `input-files/${this.selectedFileId}`,
      options: { contentType: this.selectedFile!.type },
    }).result;
  }

  private async createFileUploadRecord(username: string | undefined, result: { path: string }) {
    this.fileUpload = await ApiService.createFile({
      fileId: this.selectedFileId,
      userId: username,
      name: this.selectedFile!.name,
      size: this.selectedFile!.size,
      inputPathPrefix: result.path,
      contentType: this.selectedFile!.type,
      createdAt: new Date().toISOString(),
      status: 'pending',
    });
  }

  private async handleError(error: any) {
    this.errorMessage = 'Failed to process document. Please try again.';
    if (this.fileUpload?.fileId) {
      await ApiService.updateFile({ fileId: this.fileUpload.fileId, status: 'failed' });
    }
  }

  removeFile() {
    this.selectedFile = null;
    this.isFileTooLarge = false;
    this.errorMessage = '';
  }

  cancel() {
    this.router.navigate(['/home']);
  }
}
