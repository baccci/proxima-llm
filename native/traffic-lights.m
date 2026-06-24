#import <Cocoa/Cocoa.h>

void setTrafficLightsPosition(void *windowPtr, double xOrigin, double yCenter) {
    if (!windowPtr) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = (__bridge NSWindow *)windowPtr;
        NSButton *closeBtn = [window standardWindowButton:NSWindowCloseButton];
        NSButton *minimizeBtn = [window standardWindowButton:NSWindowMiniaturizeButton];
        NSButton *zoomBtn = [window standardWindowButton:NSWindowZoomButton];
        if (!closeBtn || !minimizeBtn || !zoomBtn) return;

        NSView *titleBarContainer = closeBtn.superview.superview;
        if (!titleBarContainer) return;

        CGFloat buttonHeight = NSHeight(closeBtn.frame);
        CGFloat buttonWidth = NSWidth(closeBtn.frame);
        CGFloat padding = NSMinX(minimizeBtn.frame) - NSMaxX(closeBtn.frame);
        CGFloat marginY = yCenter - (buttonHeight / 2.0);

        NSRect cbounds = titleBarContainer.frame;
        cbounds.size.height = buttonHeight + 2.0 * marginY;
        cbounds.origin.y = NSHeight(window.frame) - NSHeight(cbounds);
        [titleBarContainer setFrame:cbounds];

        CGFloat btnY = (NSHeight(cbounds) - buttonHeight) / 2.0;
        CGFloat x = xOrigin;
        [closeBtn setFrameOrigin:NSMakePoint(x, btnY)];
        x += buttonWidth + padding;
        [minimizeBtn setFrameOrigin:NSMakePoint(x, btnY)];
        x += buttonWidth + padding;
        [zoomBtn setFrameOrigin:NSMakePoint(x, btnY)];
    });
}
