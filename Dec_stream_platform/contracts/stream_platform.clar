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