import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure content publishing works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const creator = accounts.get('wallet_1')!;

        // Content parameters
        const contentId = 1;
        const title = "My First Video";
        const description = "This is a test video about blockchain technology.";
        const price = 1000000; // 1 STX
        const isNft = false;
        const category = "Education";
        const isPremium = false;

        // Publish content
        let block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(contentId),
                    types.ascii(title),
                    types.ascii(description),
                    types.uint(price),
                    types.bool(isNft),
                    types.ascii(category),
                    types.bool(isPremium)
                ],
                creator.address
            )
        ]);

        // Check if content was published successfully
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify content details
        const contentInfo = chain.callReadOnlyFn(
            'stream_platform',
            'get-content-info',
            [types.uint(contentId)],
            deployer.address
        );

        const contentString = contentInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(contentString.includes(`creator: ${creator.address}`), true);
        assertEquals(contentString.includes(`price: u${price}`), true);
        assertEquals(contentString.includes(`title: "${title}"`), true);
        assertEquals(contentString.includes(`category: "${category}"`), true);
        assertEquals(contentString.includes('total-earnings: u0'), true);
        assertEquals(contentString.includes('is-premium: false'), true);

        // Verify creator info was created/updated
        const creatorInfo = chain.callReadOnlyFn(
            'stream_platform',
            'get-creator-info',
            [types.principal(creator.address)],
            deployer.address
        );

        const creatorString = creatorInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(creatorString.includes('total-content: u1'), true);
        assertEquals(creatorString.includes('total-earnings: u0'), true);
        assertEquals(creatorString.includes('verified: false'), true);
        assertEquals(creatorString.includes('creator-level: u1'), true);

        // Try to publish content with same ID (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(contentId), // Same content ID
                    types.ascii("Duplicate Content"),
                    types.ascii("This should fail"),
                    types.uint(2000000),
                    types.bool(false),
                    types.ascii("Test"),
                    types.bool(false)
                ],
                creator.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u101)'); // ERR-CONTENT-EXISTS

        // Try to publish content with invalid price (0)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(2), // Different content ID
                    types.ascii("Invalid Price Content"),
                    types.ascii("This should fail due to price"),
                    types.uint(0), // Invalid price
                    types.bool(false),
                    types.ascii("Test"),
                    types.bool(false)
                ],
                creator.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // ERR-INVALID-PRICE
    },
});

Clarinet.test({
    name: "Test creator subscription system",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const creator = accounts.get('wallet_1')!;
        const subscriber = accounts.get('wallet_2')!;

        // First, publish some content as the creator to ensure CreatorInfo exists
        chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(1),
                    types.ascii("Test Video"),
                    types.ascii("Description for test video"),
                    types.uint(1000000),
                    types.bool(false),
                    types.ascii("Entertainment"),
                    types.bool(false)
                ],
                creator.address
            )
        ]);

        // Subscribe to creator
        const duration = 3; // 3 days
        const subscriptionType = "standard";
        let block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'subscribe-to-creator',
                [
                    types.principal(creator.address),
                    types.uint(duration),
                    types.ascii(subscriptionType)
                ],
                subscriber.address
            )
        ]);

        // Check if subscription was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify subscription status
        const subscriptionStatus = chain.callReadOnlyFn(
            'stream_platform',
            'get-subscription-status',
            [types.principal(subscriber.address), types.principal(creator.address)],
            deployer.address
        );

        const statusObject = subscriptionStatus.result.replace('(ok ', '').slice(0, -1);
        assertEquals(statusObject.includes('is-active: true'), true);
        assertEquals(statusObject.includes('remaining-blocks: u'), true);

        // Verify creator stats were updated
        const creatorInfo = chain.callReadOnlyFn(
            'stream_platform',
            'get-creator-info',
            [types.principal(creator.address)],
            deployer.address
        );

        const creatorString = creatorInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(creatorString.includes('subscriber-count: u1'), true);

        // Try to subscribe again (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'subscribe-to-creator',
                [
                    types.principal(creator.address),
                    types.uint(1),
                    types.ascii("premium")
                ],
                subscriber.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u106)'); // ERR-ALREADY-SUBSCRIBED

        // Try to subscribe with invalid duration (0)
        const nonSubscriber = accounts.get('wallet_3')!;
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'subscribe-to-creator',
                [
                    types.principal(creator.address),
                    types.uint(0), // Invalid duration
                    types.ascii("standard")
                ],
                nonSubscriber.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u108)'); // ERR-INVALID-DURATION

        // Fast forward past subscription expiration
        const blocksPerDay = 144;
        const subscriptionDuration = duration * blocksPerDay;
        for (let i = 0; i < subscriptionDuration + 1; i++)
        {
            chain.mineEmptyBlock();
        }

        // Check subscription status again (should be expired)
        const expiredStatus = chain.callReadOnlyFn(
            'stream_platform',
            'get-subscription-status',
            [types.principal(subscriber.address), types.principal(creator.address)],
            deployer.address
        );

        const expiredStatusObj = expiredStatus.result.replace('(ok ', '').slice(0, -1);
        assertEquals(expiredStatusObj.includes('is-active: false'), true);
    },
});

Clarinet.test({
    name: "Test content rating system",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const creator = accounts.get('wallet_1')!;
        const user1 = accounts.get('wallet_2')!;
        const user2 = accounts.get('wallet_3')!;

        // Publish content
        chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(1),
                    types.ascii("Ratable Content"),
                    types.ascii("Content for rating test"),
                    types.uint(1000000),
                    types.bool(false),
                    types.ascii("Test"),
                    types.bool(false)
                ],
                creator.address
            )
        ]);

        // Rate content by first user
        const rating1 = 4;
        let block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'rate-content',
                [types.uint(1), types.uint(rating1)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify content rating was updated
        let contentRating = chain.callReadOnlyFn(
            'stream_platform',
            'get-content-rating',
            [types.uint(1)],
            deployer.address
        );

        assertEquals(contentRating.result, `(ok u${rating1})`); // Should be exactly 4

        // Rate content by second user
        const rating2 = 5;
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'rate-content',
                [types.uint(1), types.uint(rating2)],
                user2.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify content rating was updated (should be average of 4 and 5 = 4.5, but integer division gives 4)
        contentRating = chain.callReadOnlyFn(
            'stream_platform',
            'get-content-rating',
            [types.uint(1)],
            deployer.address
        );

        assertEquals(contentRating.result, '(ok u4)'); // Integer division of (4+5)/2 = 4

        // Try to rate with invalid rating (0)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'rate-content',
                [types.uint(1), types.uint(0)],
                accounts.get('wallet_4')!.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u105)'); // ERR-INVALID-RATING

        // Try to rate with invalid rating (6)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'rate-content',
                [types.uint(1), types.uint(6)],
                accounts.get('wallet_4')!.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u105)'); // ERR-INVALID-RATING

        // Try to rate again with same user (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'rate-content',
                [types.uint(1), types.uint(3)],
                user1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u110)'); // ERR-ALREADY-RATED
    },
});

Clarinet.test({
    name: "Test playlist creation and management",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const creator = accounts.get('wallet_1')!;
        const user = accounts.get('wallet_2')!;

        // Publish some content
        chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(1),
                    types.ascii("Video 1"),
                    types.ascii("First video"),
                    types.uint(1000000),
                    types.bool(false),
                    types.ascii("Entertainment"),
                    types.bool(false)
                ],
                creator.address
            ),
            Tx.contractCall(
                'stream_platform',
                'publish-content',
                [
                    types.uint(2),
                    types.ascii("Video 2"),
                    types.ascii("Second video"),
                    types.uint(1000000),
                    types.bool(false),
                    types.ascii("Entertainment"),
                    types.bool(false)
                ],
                creator.address
            )
        ]);

        // Create playlist
        const playlistId = 1;
        const playlistName = "My Favorite Videos";
        const isPublic = true;

        let block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'create-playlist',
                [
                    types.uint(playlistId),
                    types.ascii(playlistName),
                    types.bool(isPublic)
                ],
                user.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify playlist was created
        const playlist = chain.callReadOnlyFn(
            'stream_platform',
            'get-playlist',
            [types.uint(playlistId), types.principal(user.address)],
            deployer.address
        );

        const playlistString = playlist.result.replace('(some ', '').slice(0, -1);
        assertEquals(playlistString.includes(`name: "${playlistName}"`), true);
        assertEquals(playlistString.includes('is-public: true'), true);
        assertEquals(playlistString.includes('content-ids: []'), true);

        // Add first video to playlist
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'add-to-playlist',
                [types.uint(playlistId), types.uint(1)],
                user.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Add second video to playlist
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'add-to-playlist',
                [types.uint(playlistId), types.uint(2)],
                user.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify playlist has both videos
        const updatedPlaylist = chain.callReadOnlyFn(
            'stream_platform',
            'get-playlist',
            [types.uint(playlistId), types.principal(user.address)],
            deployer.address
        );

        const updatedPlaylistString = updatedPlaylist.result.replace('(some ', '').slice(0, -1);
        assertEquals(updatedPlaylistString.includes('content-ids: [u1, u2]'), true);

        // Try to create playlist with duplicate ID (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'create-playlist',
                [
                    types.uint(playlistId), // Same ID
                    types.ascii("Duplicate Playlist"),
                    types.bool(false)
                ],
                user.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u101)'); // ERR-CONTENT-EXISTS

        // Try to add non-existent content to playlist
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'add-to-playlist',
                [types.uint(playlistId), types.uint(999)], // Non-existent content
                user.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u103)'); // ERR-CONTENT-NOT-FOUND
    },
});

Clarinet.test({
    name: "Test creator level-up mechanics",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const creator = accounts.get('wallet_1')!;

        // First, publish enough content
        const contentCount = 10; // Need at least 10 contents for level 1
        const contentTxs: Tx[] = []; // Explicitly type the array
        for (let i = 1; i <= contentCount; i++)
        {
            contentTxs.push(
                Tx.contractCall(
                    'stream_platform',
                    'publish-content',
                    [
                        types.uint(i),
                        types.ascii(`Video ${i}`),
                        types.ascii(`Description ${i}`),
                        types.uint(1000000),
                        types.bool(false),
                        types.ascii("Test"),
                        types.bool(false)
                    ],
                    creator.address
                )
            );
        }
        chain.mineBlock(contentTxs);

        // Now get enough subscribers
        const subscriberCount = 100; // Need at least 100 subscribers for level 1
        // For testing, we'll simulate this by directly manipulating the CreatorInfo data
        chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'test-set-subscriber-count',
                [types.principal(creator.address), types.uint(subscriberCount)],
                deployer.address
            )
        ]);

        // Now try to level up
        let block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'level-up-creator',
                [],
                creator.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify creator level was increased
        const creatorInfo = chain.callReadOnlyFn(
            'stream_platform',
            'get-creator-info',
            [types.principal(creator.address)],
            deployer.address
        );

        const creatorString = creatorInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(creatorString.includes('creator-level: u2'), true);

        // Try to level up again without meeting new requirements (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'level-up-creator',
                [],
                creator.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // ERR-NOT-AUTHORIZED
    },
});

Clarinet.test({
    name: "Test platform administration",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const newOwner = accounts.get('wallet_1')!;
        const regularUser = accounts.get('wallet_2')!;

        // Set a new platform fee
        const newFee = 10; // 10%
        let block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'set-platform-fee',
                [types.uint(newFee)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify platform fee was updated
        const platformFee = chain.callReadOnlyFn(
            'stream_platform',
            'get-platform-fee',
            [],
            deployer.address
        );

        assertEquals(platformFee.result, `u${newFee}`);

        // Set a new platform owner
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'set-platform-owner',
                [types.principal(newOwner.address)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the new owner can set platform fee
        const newerFee = 8; // 8%
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'set-platform-fee',
                [types.uint(newerFee)],
                newOwner.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the old owner can no longer set platform fee
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'set-platform-fee',
                [types.uint(5)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // ERR-NOT-AUTHORIZED

        // Try to set invalid platform fee (> 100%)
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'set-platform-fee',
                [types.uint(101)],
                newOwner.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u102)'); // ERR-INVALID-PRICE

        // Try to set platform owner as non-owner
        block = chain.mineBlock([
            Tx.contractCall(
                'stream_platform',
                'set-platform-owner',
                [types.principal(regularUser.address)],
                regularUser.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u100)'); // ERR-NOT-AUTHORIZED
    },
});