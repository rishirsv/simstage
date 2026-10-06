#import <UIKit/UIKit.h>

@interface BenchmarkScene : UIViewController <UIScrollViewDelegate>
@property(nonatomic) NSUInteger marker;
@property(nonatomic, strong) NSArray<UIView *> *bits;
@end

@implementation BenchmarkScene
- (void)viewDidLayoutSubviews {
  [super viewDidLayoutSubviews];
  if (self.bits) return;
  self.view.backgroundColor = UIColor.systemBackgroundColor;
  CGSize size = self.view.bounds.size;
  NSMutableArray *bits = [NSMutableArray array];
  for (NSUInteger bit = 0; bit < 8; bit++) {
    UIView *cell = [[UIView alloc] initWithFrame:CGRectMake(size.width * (.1 + bit * .1), size.height * .15, size.width * .1, size.height * .06)];
    cell.backgroundColor = UIColor.blackColor;
    [self.view addSubview:cell];
    [bits addObject:cell];
  }
  self.bits = bits;
  UIButton *advance = [UIButton buttonWithType:UIButtonTypeSystem];
  advance.frame = CGRectMake(0, size.height * .25, size.width, size.height * .2);
  [advance setTitle:@"Advance marker" forState:UIControlStateNormal];
  advance.accessibilityIdentifier = @"advance-marker";
  [advance addTarget:self action:@selector(advanceMarker) forControlEvents:UIControlEventTouchUpInside];
  [self.view addSubview:advance];
  UIScrollView *scroll = [[UIScrollView alloc] initWithFrame:CGRectMake(0, size.height * .5, size.width, size.height * .45)];
  scroll.delegate = self;
  scroll.accessibilityIdentifier = @"benchmark-scroll";
  scroll.contentSize = CGSizeMake(size.width, size.height * 6);
  for (NSUInteger row = 0; row < 40; row++) {
    UILabel *label = [[UILabel alloc] initWithFrame:CGRectMake(0, row * size.height * .15, size.width, size.height * .15)];
    label.text = [NSString stringWithFormat:@"Row %lu", (unsigned long)row];
    label.textAlignment = NSTextAlignmentCenter;
    label.backgroundColor = row % 2 ? UIColor.systemTealColor : UIColor.systemOrangeColor;
    [scroll addSubview:label];
  }
  [self.view addSubview:scroll];
}
- (void)advanceMarker {
  self.marker = (self.marker + 1) & 255;
  for (NSUInteger bit = 0; bit < 8; bit++) self.bits[bit].backgroundColor = self.marker & (1 << bit) ? UIColor.whiteColor : UIColor.blackColor;
  self.view.accessibilityValue = [NSString stringWithFormat:@"Marker %lu", (unsigned long)self.marker];
}
- (void)scrollViewDidScroll:(UIScrollView *)scrollView { [self advanceMarker]; }
@end

@interface BenchmarkSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end
@implementation BenchmarkSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.rootViewController = [BenchmarkScene new];
  [self.window makeKeyAndVisible];
}
@end
@interface BenchmarkApp : UIResponder <UIApplicationDelegate>
@end
@implementation BenchmarkApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
  return YES;
}
@end
int main(int argc, char *argv[]) {
  @autoreleasepool { return UIApplicationMain(argc, argv, nil, NSStringFromClass(BenchmarkApp.class)); }
}
