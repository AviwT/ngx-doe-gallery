import {
  Component,
  OnInit,
  Input,
  OnChanges,
  SimpleChanges,
  HostBinding,
  ViewChild,
  ElementRef,
  Renderer2,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { fromEvent, Subscription } from 'rxjs';

@Component({
  selector: 'ngx-galerie',
  templateUrl: './ngx-galerie.component.html',
  styleUrls: ['./ngx-galerie.component.scss']
})
export class NgxGalerieComponent implements OnChanges, OnInit, OnDestroy {
  @Input()
  items: string[];

  @Input()
  thumbsOrientation: 'top' | 'bottom' | 'left' | 'right' = 'left';

  @Input()
  thumbWidth = 120;

  @Input()
  thumbHeight = 80;

  @ViewChild('imageList', { static: false })
  imageList: ElementRef;

  @ViewChild('thumbnailList', { static: false })
  thumbnailList: ElementRef;

  @HostBinding('class.column')
  get galleryCollumn() {
    return (
      this.thumbsOrientation == 'top' || this.thumbsOrientation == 'bottom'
    );
  }

  // TODO rework selection mechanism
  selectedItem: string;
  selectedItemX: number;
  itemWidth: number;

  private resizeSub: Subscription;

  constructor(private renderer: Renderer2, private elRef: ElementRef) {}

  ngOnChanges({ items }: SimpleChanges) {
    if (items.previousValue !== items.currentValue) {
      this.selectedItem = this.items[0];
    }
  }

  ngOnInit() {
    if (typeof window !== 'undefined') {
      this.resizeSub = fromEvent(window, 'resize').subscribe(this.onResize);
    }
  }

  ngOnDestroy() {
    this.resizeSub && this.resizeSub.unsubscribe();
  }

  onPanStart() {
    this.selectedItemX = this.getTranslateX(this.imageList.nativeElement);
  }

  onPan(e) {
    const imageList = this.imageList.nativeElement as HTMLUListElement;

    this.renderer.setStyle(imageList, 'transition', `transform 0s`);
    this.setTranslateX(e.deltaX + this.selectedItemX, imageList);
  }

  onPanEnd(e) {
    const { items } = this;
    const imageList = this.imageList.nativeElement as HTMLUListElement;

    this.renderer.setStyle(imageList, 'transition', '');

    if (Math.abs(e.deltaX) > 100) {
      const nextItemIndexDelta = e.deltaX > 0 ? -1 : 1;
      const nextItem =
        items[items.indexOf(this.selectedItem) + nextItemIndexDelta];
      this.selectItem(nextItem);
    } else {
      const oldItemIndex = items.indexOf(this.selectedItem);
      const x = this.itemWidth ? -oldItemIndex * this.itemWidth : 0;
      this.setTranslateX(x, imageList);
    }
  }

  onResize = () => {
    this.positionSelectedItem();
  };

  selectItem(item: string) {
    this.selectedItem = item;
    this.positionSelectedItem();
  }

  private positionSelectedItem() {
    this.extractItemWidth();

    const selectedItemIndex = this.items.indexOf(this.selectedItem);

    this.setTranslateX(
      -selectedItemIndex * this.itemWidth,
      this.imageList.nativeElement
    );
  }

  private extractItemWidth() {
    const imageList = this.imageList.nativeElement as HTMLUListElement;

    const { width, marginLeft, marginRight } = getComputedStyle(
      imageList.querySelector('li')
    );

    this.itemWidth =
      parseInt(width) + parseInt(marginLeft) + parseInt(marginRight);
  }

  private extractItemWidthIfNeeded() {
    if (!this.itemWidth) {
      this.extractItemWidth();
    }
  }

  private getTranslateX(el: HTMLElement): number {
    const match = el.style.transform.match(/translate3d\((-?\d+)/);
    return match && +match[1];
  }

  private setTranslateX(x: number, el: HTMLElement) {
    this.renderer.setStyle(el, 'transform', `translate3D(${x}px, 0px, 0px)`);
  }
}
