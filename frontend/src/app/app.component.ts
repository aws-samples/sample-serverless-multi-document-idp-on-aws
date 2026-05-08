import { Component } from '@angular/core';
import { NavbarComponent } from './navbar/navbar.component';
import { ContentComponent } from './content/content.component';
import { AmplifyAuthenticatorModule, AuthenticatorService } from '@aws-amplify/ui-angular';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';

import awsConfig from '../config/aws-config.json';
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: awsConfig.Auth.Cognito.userPoolId,
      userPoolClientId: awsConfig.Auth.Cognito.userPoolClientId,
      identityPoolId: awsConfig.Auth.Cognito.identityPoolId,
      loginWith: { email: true },
    },
  },
  Storage: {
    S3: {
      bucket: awsConfig.Storage.S3.bucket,
      region: awsConfig.Storage.S3.region,
    },
  },
  API: {
    GraphQL: {
      endpoint: awsConfig.API.GraphQL.endpoint,
      region: awsConfig.API.GraphQL.region,
      defaultAuthMode: 'iam' as const,
    },
  },
});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NavbarComponent, ContentComponent, AmplifyAuthenticatorModule, CommonModule, MatSidenavModule, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Intelligent Document Processing';
  constructor(public authenticator: AuthenticatorService) {}
}
