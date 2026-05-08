import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, FileRecord } from '../services/api.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatChipsModule, MatProgressSpinnerModule],
  templateUrl: './review.component.html',
  styleUrl: './review.component.css'
})
export class ReviewComponent implements OnInit {
  files: FileRecord[] = [];
  isRefreshing = false;
  nextToken?: string;
  hasMore = false;
  displayedColumns = ['name', 'status', 'userId', 'createdAt', 'processingTime', 'actions'];

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    try {
      const result = await ApiService.listFiles(50);
      this.files = result.items;
      this.nextToken = result.nextToken;
      this.hasMore = !!result.nextToken;
      this.isRefreshing = false;
    } catch (error) {
      console.error('Error fetching files');
    }
  }

  async loadMore() {
    if (!this.nextToken) return;
    try {
      const result = await ApiService.listFiles(50, this.nextToken);
      this.files = [...this.files, ...result.items];
      this.nextToken = result.nextToken;
      this.hasMore = !!result.nextToken;
    } catch (error) {
      console.error('Error loading more files');
    }
  }

  processingTime(file: FileRecord): string {
    if (!file?.updatedAt || !file?.createdAt) return '';
    const diffInMs = new Date(file.updatedAt).getTime() - new Date(file.createdAt).getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    return diffInSeconds === 0 ? '...' : `${diffInSeconds}s`;
  }

  getStatusClass(status: string | undefined): string {
    switch (status?.toLowerCase()) {
      case 'completed': return 'status-success';
      case 'processing': return 'status-info';
      case 'failed': return 'status-error';
      default: return 'status-default';
    }
  }

  refreshFiles() {
    this.isRefreshing = true;
    this.loadData();
  }
}
