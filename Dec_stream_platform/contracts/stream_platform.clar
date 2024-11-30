;; Decentralized Streaming Platform Smart Contract

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-CONTENT-EXISTS (err u101))
(define-constant ERR-INVALID-PRICE (err u102))
(define-constant ERR-CONTENT-NOT-FOUND (err u103))
(define-constant ERR-INSUFFICIENT-FUNDS (err u104))
(define-constant ERR-INVALID-RATING (err u105))
(define-constant ERR-ALREADY-SUBSCRIBED (err u106))
(define-constant ERR-NOT-SUBSCRIBED (err u107))
(define-constant ERR-INVALID-DURATION (err u108))
(define-constant ERR-SUBSCRIPTION-EXPIRED (err u109))
(define-constant ERR-ALREADY-RATED (err u110))

;; Data variables
(define-data-var platform-fee uint u5)
(define-data-var subscription-fee uint u50)
(define-data-var platform-owner principal tx-sender)

;; Content Management
(define-map ContentInfo
    { content-id: uint }
    {
        creator: principal,
        price: uint,
        title: (string-ascii 64),
        description: (string-ascii 256),
        is-nft: bool,
        total-earnings: uint,
        rating-sum: uint,
        rating-count: uint,
        category: (string-ascii 32),
        creation-height: uint,
        is-premium: bool
    }
)

(define-map CreatorInfo
    { creator: principal }
    {
        total-content: uint,
        total-earnings: uint,
        verified: bool,
        subscriber-count: uint,
        join-height: uint,
        creator-level: uint
    }
)

(define-map ContentOwnership
    { content-id: uint, owner: principal }
    { 
        purchased-at: uint,
        last-accessed: uint
    }
)

;; Subscription System
(define-map Subscriptions
    { subscriber: principal, creator: principal }
    {
        start-height: uint,
        end-height: uint,
        subscription-type: (string-ascii 16)
    }
)

;; Content Ratings
(define-map UserRatings
    { content-id: uint, user: principal }
    { rating: uint }
)

;; Playlists
(define-map UserPlaylists
    { playlist-id: uint, owner: principal }
    {
        name: (string-ascii 64),
        content-ids: (list 100 uint),
        is-public: bool
    }
)

;; NFT definitions
(define-non-fungible-token content-nft uint)

;; Administrative functions
(define-public (set-platform-owner (new-owner principal))
    (begin
        (asserts! (is-eq tx-sender (var-get platform-owner)) ERR-NOT-AUTHORIZED)
        (ok (var-set platform-owner new-owner))
    )
)

(define-public (set-platform-fee (new-fee uint))
    (begin
        (asserts! (is-eq tx-sender (var-get platform-owner)) ERR-NOT-AUTHORIZED)
        (asserts! (< new-fee u100) ERR-INVALID-PRICE)
        (ok (var-set platform-fee new-fee))
    )
)

(define-public (publish-content 
    (content-id uint) 
    (title (string-ascii 64))
    (description (string-ascii 256))
    (price uint)
    (is-nft bool)
    (category (string-ascii 32))
    (is-premium bool))
    (let
        ((creator tx-sender))
        (asserts! (is-none (map-get? ContentInfo {content-id: content-id})) ERR-CONTENT-EXISTS)
        (asserts! (> price u0) ERR-INVALID-PRICE)
        
        (map-set ContentInfo
            {content-id: content-id}
            {
                creator: creator,
                price: price,
                title: title,
                description: description,
                is-nft: is-nft,
                total-earnings: u0,
                rating-sum: u0,
                rating-count: u0,
                category: category,
                creation-height: block-height,
                is-premium: is-premium
            }
        )
        
        (match (map-get? CreatorInfo {creator: creator})
            prev-info ;; if-some case
            (map-set CreatorInfo
                {creator: creator}
                {
                    total-content: (+ (default-to u0 (some (get total-content prev-info))) u1),
                    total-earnings: (default-to u0 (some (get total-earnings prev-info))),
                    verified: (default-to false (some (get verified prev-info))),
                    subscriber-count: (default-to u0 (some (get subscriber-count prev-info))),
                    join-height: (default-to block-height (some (get join-height prev-info))),
                    creator-level: (default-to u1 (some (get creator-level prev-info)))
                }
            )
            ;; if-none case
            (map-set CreatorInfo
                {creator: creator}
                {
                    total-content: u1,
                    total-earnings: u0,
                    verified: false,
                    subscriber-count: u0,
                    join-height: block-height,
                    creator-level: u1
                }
            )
        )
        
        (if is-nft
            (nft-mint? content-nft content-id creator)
            (ok true)
        )
    )
)