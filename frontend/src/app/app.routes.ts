import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { UploadComponent } from './upload/upload.component';
import { ReviewComponent } from './review/review.component';
import { ReviewDetailComponent } from './review/review-detail/review-detail.component';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
    },
    {
        path: 'home',
        component: HomeComponent
    },
    {
        path: 'upload',
        component: UploadComponent
    },
    {
        path: 'review',
        component: ReviewComponent
    },
    {
        path: 'review-detail/:fileId',
        component: ReviewDetailComponent
    },
];