import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  TemplateRef,
  ViewChild
} from '@angular/core';
import {
  animationFrameScheduler,
  BehaviorSubject,
  fromEvent,
  merge,
  Observable,
  of,
  Subject
} from 'rxjs';
import {
  debounceTime,
  filter,
  map,
  repeat,
  startWith,
  switchMapTo,
  take,
  takeUntil,
  takeWhile,
  tap
} from 'rxjs/operators';
import { GalleryItem } from '../../core/gallery-item';
import { ImageFit } from '../../core/image-fit';

@Component({
  selector: 'ngx-image-viewer',
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  @Input()
  items: GalleryItem[];

  @Input()
  arrows: boolean;

  @Input()
  selectedItem: number;

  @Input()
  imageCounter: boolean;

  @Input()
  set imageFit(fit: ImageFit) {
    this.imageStyles = {
      ...this.imageStyles,
      backgroundSize: fit || this.imageStyles.backgroundSize
    };
  }

  @Input()
  imageTemplate: TemplateRef<any>;

  @Input()
  loop: boolean;

  @Output()
  imageClick = new EventEmitter<Event>();

  @Output()
  selection = new EventEmitter<number>();

  @ViewChild('imageList', { static: true }) imageList: ElementRef<HTMLElement>;

  imageStyles = {
    backgroundSize: 'contain'
  };
  imagesShown = false;
  imagesTransition = false;

  private scrolling$ = new BehaviorSubject(false);
  private destroy$ = new Subject();
  private itemWidth: number;
  private smoothScrollBehaviorSupported =
    typeof CSS !== 'undefined' && CSS.supports('scroll-behavior: smooth');

  get showPrevArrow() {
    return this.arrows && (this.selectedItem > 0 || this.loop);
  }

  get showNextArrow() {
    return (
      this.arrows && (this.selectedItem < this.items.length - 1 || this.loop)
    );
  }

  constructor(
    private elRef: ElementRef<HTMLElement>,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.imageCounter === undefined && (this.imageCounter = true);

    if (this.loop) {
      this.initFringeLooping();
    }

    this.initOnScrollItemSelection();

    if (typeof window !== 'undefined') {
      fromEvent(window, 'resize')
        .pipe(startWith(null), takeUntil(this.destroy$))
        .subscribe(this.onResize);
    }
  }

  ngOnDestroy() {
    this.destroy$.next(null);
    this.destroy$.complete();
  }

  prev() {
    this.afterScroll().subscribe(_ => this.select(this.selectedItem - 1));
  }

  next() {
    this.afterScroll().subscribe(_ => this.select(this.selectedItem + 1));
  }

  select(index: number) {
    if (!this.loop && (index < 0 || index >= this.items.length)) {
      this.center();
      return;
    }

    if (index < 0) {
      index = this.items.length - 1;
    } else if (index >= this.items.length) {
      index = 0;
    }

    this.afterScroll().subscribe(_ => {
      this.selectedItem = index;
      this.selection.emit(index);
      this.center();
    });
  }

  private afterScroll(): Observable<any> {
    return this.scrolling$.pipe(
      filter(scrolling => !scrolling),
      take(1)
    );
  }

  private center() {
    let shift = this.selectedItem * this.itemWidth;

    if (this.loop) {
      shift += 50;
    }
    this.shiftImages(shift);
  }

  private getSelectedItemIndexFromScrollPosition(): number {
    const scrollLeft = this.imageList.nativeElement.scrollLeft;
    const selectedPrecise =
      (this.loop ? scrollLeft - 50 : scrollLeft) / this.itemWidth;

    return Math.round(selectedPrecise);
  }

  /**
   * Inits monitor of user scrolling to the fringes of the image list.
   * If scroll to the fringe detected, image list will loop
   */
  private initFringeLooping() {
    fromEvent(this.elRef.nativeElement, 'touchstart')
      .pipe(
        switchMapTo(
          fromEvent(this.elRef.nativeElement, 'touchmove').pipe(take(1))
        ),
        // the merge below is there due to differences between iOS and Android
        // the former emits scroll events after touchend, whereas the latter emits touchend after scroll events
        switchMapTo(
          merge(
            fromEvent(document, 'touchend'),
            fromEvent(this.imageList.nativeElement, 'scroll')
          )
        ),
        debounceTime(50),
        takeUntil(this.destroy$)
      )
      .subscribe(_ => {
        const scrollLeft = this.imageList.nativeElement.scrollLeft;

        if (scrollLeft < 50) {
          this.selectedItem = this.items.length - 1;
          this.cd.markForCheck();
          this.center();
        } else if (scrollLeft > (this.items.length - 1) * this.itemWidth + 50) {
          this.selectedItem = 0;
          this.cd.markForCheck();
          this.center();
        }
      });
  }

  /**
   * Determines selected item upon native scroll in the image list
   */
  private initOnScrollItemSelection() {
    fromEvent(this.imageList.nativeElement, 'scroll')
      .pipe(
        tap(_ => this.scrolling$.next(true)),
        // determine the scroll end. 100ms should be enough
        debounceTime(100),
        takeUntil(this.destroy$)
      )
      .subscribe(_ => {
        this.selectedItem = this.getSelectedItemIndexFromScrollPosition();
        this.scrolling$.next(false);
        this.selection.emit(this.selectedItem);
      });
  }

  private onResize = () => {
    // NOTE: This combination of requested frames solves problem when switching between landscape and portrait
    // Because the image list is based on pure scroll, turning phone changes scroll position because image width changes.
    // That way, the selected image is no longer centered.
    //
    // The approach below first turns off image smooth transition before the incoming frame. That allows the second
    // requestAnimationFrame to take advantage of it, center the image and turn on the smooth transition before a second paint.
    // Given this process only requires 2 frames and there is no image transition in between, it looks very snappy to the user.
    requestAnimationFrame(() => {
      this.imagesTransition = false;
      this.cd.detectChanges();

      requestAnimationFrame(() => {
        this.itemWidth = this.elRef.nativeElement.offsetWidth;
        this.center();
        this.imagesShown = true;
        this.imagesTransition = true;
        this.cd.detectChanges();
      });
    });
  };

  private shiftImages(x: number) {
    const imageListEl = this.imageList.nativeElement;

    if (!this.smoothScrollBehaviorSupported && this.imagesTransition) {
      this.shiftImagesManually(x);
    } else {
      imageListEl.scrollLeft = x;
    }
  }

  /**
   * Substitutes missing scroll-behavior: smooth capabilities
   * @param x - scrollLeft
   */
  private shiftImagesManually(x: number) {
    const imageListEl = this.imageList.nativeElement;
    const startTime = Date.now();
    const startScroll = imageListEl.scrollLeft;
    const scrollDelta = Math.abs(startScroll - x);
    const negative = startScroll > x;
    let timeout =
      200 + Math.floor((scrollDelta - this.itemWidth) / this.itemWidth) * 100;

    timeout = Math.min(timeout, 1200);

    of(0, animationFrameScheduler)
      .pipe(
        repeat(),
        map(_ => {
          const timeEllapsedRatio = (Date.now() - startTime) / timeout;
          const suggestedScroll =
            startScroll +
            (negative
              ? -scrollDelta * timeEllapsedRatio
              : scrollDelta * timeEllapsedRatio);

          return negative
            ? Math.max(x, Math.ceil(suggestedScroll))
            : Math.min(x, Math.ceil(suggestedScroll));
        }),
        takeWhile(_ => timeout > Date.now() - startTime, true)
      )
      .subscribe(scroll => {
        imageListEl.scrollLeft = scroll;
      });
  }
}
