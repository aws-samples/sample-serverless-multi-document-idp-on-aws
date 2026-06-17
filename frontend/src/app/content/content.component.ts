import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-content',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './content.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './content.component.css'
})
export class ContentComponent {

}
