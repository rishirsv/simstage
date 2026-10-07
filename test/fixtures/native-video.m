// Exercise the real encoder-output path without connecting to CoreSimulator.
#define main simulatorStreamMain
#import "../../native/SimulatorStream.m"
#undef main

@interface SimulatorStreamFixture : SimulatorStream
- (dispatch_queue_t)fixtureQueue;
@end
@implementation SimulatorStreamFixture
- (dispatch_queue_t)fixtureQueue { return queue; }
- (instancetype)init {
    if ((self = [super init])) {
        encoderPermit = dispatch_semaphore_create(0);
        queue = dispatch_queue_create("settling-fixture", DISPATCH_QUEUE_SERIAL);
        encodedWidth = sourceWidth = 1320;
        encodedHeight = sourceHeight = 2868;
        encodedOrientation = 1;
    }
    return self;
}
@end

static IndigoMessage *fixtureMouse(CGPoint *location, CGPoint *windowLocation, uint32_t target, NSUInteger eventType, CGSize displaySize, uint32_t edge) {
    return calloc(1, sizeof(IndigoMessage));
}

@interface TouchReleaseFixture : SimulatorStream
@property(nonatomic) NSArray<NSNumber *> *deliveries;
@property(nonatomic) NSUInteger attempts;
- (BOOL)hasTouch;
@end
@implementation TouchReleaseFixture
- (instancetype)init {
    if ((self = [super init])) {
        hidClient = [NSObject new];
        mouseMessage = fixtureMouse;
        inputQueue = dispatch_queue_create("touch-fixture", DISPATCH_QUEUE_SERIAL);
        atomic_store(&surfaceWidth, 440);
        atomic_store(&surfaceHeight, 956);
    }
    return self;
}
- (BOOL)sendHID:(IndigoMessage *)message {
    free(message);
    NSUInteger index = self.attempts++;
    return index < self.deliveries.count && self.deliveries[index].boolValue;
}
- (BOOL)hasTouch { return touching; }
@end

static CMSampleBufferRef makeSample(int headerLength, uint8_t marker, size_t payloadLength, BOOL notSync, BOOL truncated, BOOL hevc) {
    // SPS and PPS from the checked-in simulator-video validation sample.
    const uint8_t sps[] = { 39, 66, 0, 50, 171, 64, 41, 128, 180, 242, 206, 128 };
    const uint8_t pps[] = { 40, 206, 60, 128 };
    const uint8_t *parameters[] = { sps, pps };
    const size_t sizes[] = { sizeof(sps), sizeof(pps) };
    CMFormatDescriptionRef format = nil;
    if (hevc) {
        // Real VideoToolbox Main-profile parameters from the HEVC relay sample.
        const uint8_t vps[] = { 64, 1, 12, 1, 255, 255, 1, 96, 0, 0, 3, 0, 176, 0, 0, 3, 0, 0, 3, 0, 150, 23, 2, 64 };
        const uint8_t hevcSps[] = { 66, 1, 1, 1, 96, 0, 0, 3, 0, 176, 0, 0, 3, 0, 0, 3, 0, 150, 160, 2, 96, 128, 10, 65, 205, 88, 129, 123, 145, 100, 82, 255, 203, 159, 196, 254, 136 };
        const uint8_t hevcPps[] = { 68, 1, 192, 114, 244, 83, 100 };
        const uint8_t *hevcParameters[] = { vps, hevcSps, hevcPps };
        const size_t hevcSizes[] = { sizeof(vps), sizeof(hevcSps), sizeof(hevcPps) };
        if (CMVideoFormatDescriptionCreateFromHEVCParameterSets(kCFAllocatorDefault, 3, hevcParameters, hevcSizes, headerLength, nil, &format)) abort();
    } else if (CMVideoFormatDescriptionCreateFromH264ParameterSets(kCFAllocatorDefault, 2, parameters, sizes, headerLength, &format)) abort();
    NSMutableData *data = [NSMutableData dataWithLength:headerLength + payloadLength + (truncated ? 1 : 0)];
    uint8_t *bytes = data.mutableBytes;
    for (int index = 0; index < headerLength; index++) bytes[headerLength - index - 1] = (payloadLength >> (8 * index)) & 0xff;
    memset(bytes + headerLength, marker, payloadLength);
    bytes[headerLength] = hevc ? (notSync ? 0x02 : 0x26) : (notSync ? 0x41 : 0x65);
    if (hevc) bytes[headerLength + 1] = 1;
    CMBlockBufferRef block = nil;
    if (CMBlockBufferCreateWithMemoryBlock(kCFAllocatorDefault, nil, data.length, kCFAllocatorDefault, nil, 0, data.length, 0, &block)) abort();
    if (CMBlockBufferReplaceDataBytes(data.bytes, block, 0, data.length)) abort();
    CMSampleTimingInfo timing = { CMTimeMake(1, 30), kCMTimeZero, kCMTimeInvalid };
    size_t length = data.length;
    CMSampleBufferRef sample = nil;
    if (CMSampleBufferCreateReady(kCFAllocatorDefault, block, format, 1, 1, &timing, 1, &length, &sample)) abort();
    CFMutableDictionaryRef attachment = (CFMutableDictionaryRef)CFArrayGetValueAtIndex(CMSampleBufferGetSampleAttachmentsArray(sample, YES), 0);
    CFDictionarySetValue(attachment, kCMSampleAttachmentKey_NotSync, notSync ? kCFBooleanTrue : kCFBooleanFalse);
    CFRelease(block);
    CFRelease(format);
    return sample;
}

int main(int argc, char **argv) {
    @autoreleasepool {
        if (argc != 3) return 2;
        signal(SIGPIPE, SIG_IGN);
        fcntl(STDOUT_FILENO, F_SETFL, fcntl(STDOUT_FILENO, F_GETFL) | O_NONBLOCK);
        SimulatorStreamFixture *stream = [SimulatorStreamFixture new];
        NSString *mode = @(argv[1]);
        int headerLength = atoi(argv[2]);
        if ([mode hasPrefix:@"touch-"]) {
            TouchReleaseFixture *touch = [TouchReleaseFixture new];
            BOOL releaseFails = ![mode isEqualToString:@"touch-release-ok"];
            BOOL downFails = [mode isEqualToString:@"touch-down-uncertain"];
            touch.deliveries = @[@(!downFails), @(!releaseFails), @YES];
            [touch command:"tap 17 0.25 0.5 1 0.05"];
            if (touch.attempts != 2 || touch.hasTouch != releaseFails) return 3;
            if ([mode isEqualToString:@"touch-release-retry"]) {
                if (![touch touchPhase:'u' x:0.25 y:0.5] || touch.hasTouch) return 4;
            }
            [touch stop];
            if (touch.hasTouch || touch.attempts != (releaseFails ? 3 : 2)) return 5;
        } else if ([mode hasPrefix:@"settle-"]) {
            dispatch_sync([stream fixtureQueue], ^{
                uint64_t started = mach_absolute_time();
                mach_timebase_info_data_t base;
                mach_timebase_info(&base);
                uint64_t deadline = started + (uint64_t)(300 * 1e6 * base.denom / base.numer);
                [stream checkSettling:17 quietMs:150 deadline:deadline started:started];
                if ([mode isEqualToString:@"settle-animated"]) for (int index = 1; index <= 7; index++) {
                    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, index * 50 * NSEC_PER_MSEC), [stream fixtureQueue], ^{ [stream receiveFrame]; });
                }
            });
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.45]];
        } else if ([mode isEqualToString:@"concurrent"]) {
            dispatch_group_t group = dispatch_group_create();
            for (uint8_t marker = 0x55; marker <= 0x56; marker++) {
                dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
                    CMSampleBufferRef sample = makeSample(headerLength, marker, 128 * 1024, YES, NO, NO);
                    for (int index = 0; index < 12; index++) [stream emitSample:sample status:noErr capture:&(CapturedFrame){ .id = 42, .capturedAtUnixMs = 123456789 }];
                    CFRelease(sample);
                });
            }
            dispatch_group_wait(group, DISPATCH_TIME_FOREVER);
        } else {
            CMSampleBufferRef sample = makeSample(headerLength, 0x55, 5, ![mode hasSuffix:@"key"], [mode hasSuffix:@"truncated"], [mode hasPrefix:@"hevc"]);
            [stream emitSample:sample status:noErr capture:&(CapturedFrame){ .id = 42, .capturedAtUnixMs = 123456789 }];
            CFRelease(sample);
        }
        return exitCode;
    }
}
