import {
  Box,
  Button,
  Flex,
  Icon,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import { useEffect, useMemo, useState } from 'react'
import { BiRefresh } from 'react-icons/bi'
import useActivity, { ActivityFilter } from '../../hooks/useActivity'
import useNotifier from '../../hooks/useNotifier'
import {
  getStoredActivityState,
  saveActivityState,
  StoredActivityState,
} from '../../utils/extensionConfig'
import { useAllTraitCountExcluded } from '../../utils/rarity'
import { useUser } from '../../utils/user'
import {
  createTokenEligibilityMap,
  generateId,
  Notifier,
} from '../Activity/ListingNotifierForm'
import Logo from '../Logo'
import ActivityModal, { prepareCollection } from './ActivityModal'
import { Collection } from './WatchedCollection'
import Toast from '../Toast'
import usePendingTransactions from '../../hooks/usePendingTransactions'
import { getLangAgnosticPath } from '../../utils/route'
import useSentTransactions from '../../hooks/useSentTransactions'

// Keep state cached so it's not lost when component is unmounted from
// navigating on OpenSea
type CachedState = {
  pollInterval: number
  watchedCollections: Collection[]
  notifiers: Notifier[]
  activityFilter: ActivityFilter
  playSound: boolean
  sendNotification: boolean
}
let cachedState: CachedState = {
  pollInterval: 2,
  watchedCollections: [],
  notifiers: [],
  activityFilter: 'ALL',
  playSound: true,
  sendNotification: true,
}

const Activity = () => {
  const modalDisclosure = useDisclosure()
  const sentTransactions = useSentTransactions()
  const [activeCollectionSlug, setActiveCollectionSlug] = useState<
    string | undefined
  >()
  const [watchedCollections, setWatchedCollections] = useState<Collection[]>(
    cachedState.watchedCollections,
  )
  const toast = useToast()
  const [notifiers, setNotifiers] = useState<Notifier[]>(cachedState.notifiers)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>(
    cachedState.activityFilter,
  )
  const [pollInterval, setPollInterval] = useState(cachedState.pollInterval)
  const [playSound, setPlaySound] = useState(cachedState.playSound)
  const [sendNotification, setSendNotification] = useState(
    cachedState.sendNotification,
  )
  const allTraitCountExcluded = useAllTraitCountExcluded()

  const { isSubscriber } = useUser() || { isSubscriber: false }

  const [
    storedActivityState,
    setStoredActivityState,
  ] = useState<StoredActivityState | null>(null)

  const activityState = useActivity({
    pollInterval,
    collectionSlugs: watchedCollections.map(({ slug }) => slug),
    filter: activityFilter,
  })

  const { matchedAssets, unseenMatchCount, clearMatches } = useNotifier({
    activityEvents: activityState.events,
    allTraitCountExcluded,
    notifiers,
    playSound,
    sendNotification,
    isOpen: modalDisclosure.isOpen,
  })

  const contractAddressMap = useMemo(() => {
    const result: Record<string, boolean> = {}
    activityState.events.forEach(({ contractAddress }) => {
      result[contractAddress] = true
    })
    matchedAssets.forEach(({ contractAddress }) => {
      result[contractAddress] = true
    })
    return result
  }, [activityState.events, matchedAssets])

  const pendingTransactionRecord = usePendingTransactions({
    contractAddressMap,
    active: watchedCollections.length > 0,
  })

  useEffect(() => {
    ;(async () => {
      const state = await getStoredActivityState()
      if (state) {
        setStoredActivityState(state)
      }
    })()
  }, [])

  const storeActivityState = ({
    collections,
    notifiers,
  }: {
    collections: Collection[]
    notifiers: Notifier[]
  }) => {
    saveActivityState({
      collections: collections.map(({ slug, name }) => ({ slug, name })),
      notifiers: notifiers.map(
        ({ tokenEligibilityMap, collection, ...rest }) => ({
          ...rest,
          collectionSlug: collection.slug,
        }),
      ),
    })
  }

  useEffect(() => {
    cachedState = {
      pollInterval,
      watchedCollections,
      notifiers,
      activityFilter,
      playSound,
      sendNotification,
    }
  }, [
    pollInterval,
    watchedCollections,
    notifiers,
    activityFilter,
    playSound,
    sendNotification,
  ])

  return (
    <>
      <Flex height="100%" px="2" alignItems="center">
        <Box mx="3" width="24px" height="24px">
          {activityState.status !== 'INACTIVE' && (
            <Icon
              as={BiRefresh}
              width="24px"
              height="24px"
              animation="SuperSea__Rotate 4s linear infinite"
            />
          )}
        </Box>
        <Box position="relative">
          {unseenMatchCount > 0 ? (
            <Flex
              color="white"
              bg="red.500"
              fontSize="xs"
              fontWeight="500"
              px="1"
              position="absolute"
              top="0"
              right="0"
              minWidth="20px"
              height="20px"
              transform="translate(50%, -50%)"
              borderRadius="20px"
              alignItems="center"
              justifyContent="center"
              lineHeight={0}
              zIndex={2}
            >
              {unseenMatchCount}
            </Flex>
          ) : null}
          <Button
            leftIcon={<Logo width="20px" height="20px" color="white" />}
            color="white"
            iconSpacing="3"
            onClick={() => {
              const path = getLangAgnosticPath()
              if (path.startsWith('/collection')) {
                setActiveCollectionSlug(path.split('/').filter(Boolean)[1])
              }
              modalDisclosure.onOpen()
            }}
            bg="blue.500"
            _hover={{ bg: 'blue.400' }}
            _active={{ bg: 'blue.300' }}
          >
            Activity
          </Button>
        </Box>
        <ActivityModal
          activeCollectionSlug={activeCollectionSlug}
          status={activityState.status}
          collections={watchedCollections}
          notifiers={notifiers}
          pollInterval={pollInterval}
          matchedAssets={matchedAssets}
          onChangePollInterval={setPollInterval}
          onClearMatches={clearMatches}
          onAddCollection={(collection) => {
            const newCollections = [...watchedCollections, collection]
            setWatchedCollections(newCollections)
            storeActivityState({ collections: newCollections, notifiers })
          }}
          onRemoveCollection={(collection) => {
            const newCollections = watchedCollections.filter(
              (c) => c.slug !== collection.slug,
            )
            setWatchedCollections(newCollections)
            storeActivityState({ collections: newCollections, notifiers })
          }}
          onAddNotifier={(notifier) => {
            const newNotifiers = [...notifiers, notifier]
            setNotifiers(newNotifiers)
            storeActivityState({
              collections: watchedCollections,
              notifiers: newNotifiers,
            })
          }}
          onEditNotifier={(notifier) => {
            const newNotifiers = notifiers.map((n) =>
              n.id === notifier.id ? notifier : n,
            )
            setNotifiers(newNotifiers)
            storeActivityState({
              collections: watchedCollections,
              notifiers: newNotifiers,
            })
          }}
          onRemoveNotifier={(notifier) => {
            const newNotifiers = notifiers.filter((n) => n.id !== notifier.id)
            setNotifiers(newNotifiers)
            storeActivityState({
              collections: watchedCollections,
              notifiers: newNotifiers,
            })
          }}
          activityFilter={activityFilter}
          onChangeActivityFilter={setActivityFilter}
          isOpen={modalDisclosure.isOpen}
          onClose={modalDisclosure.onClose}
          events={activityState.filteredEvents}
          pendingTransactionRecord={pendingTransactionRecord}
          saleRecord={activityState.saleRecord}
          sentTransactions={sentTransactions}
          playSound={playSound}
          onChangePlaySound={setPlaySound}
          sendNotification={sendNotification}
          onChangeSendNotification={setSendNotification}
          storedActivityState={storedActivityState}
          onDiscardStoredState={() => {
            storeActivityState({
              collections: watchedCollections,
              notifiers,
            })
          }}
          onRestoreStoredState={async () => {
            if (!storedActivityState) return
            try {
              const loadedCollections = watchedCollections.reduce<
                Record<string, Collection | boolean>
              >((acc, c) => {
                acc[c.slug] = c
                return acc
              }, {})

              const collectionsToLoad = [
                ...storedActivityState.collections.map(({ slug }) => slug),
                ...storedActivityState.notifiers.map(
                  ({ collectionSlug }) => collectionSlug,
                ),
              ].reduce<string[]>((acc, slug) => {
                if (loadedCollections[slug]) return acc
                loadedCollections[slug] = true
                acc.push(slug)
                return acc
              }, [])

              await Promise.all(
                collectionsToLoad.map(async (slug) => {
                  const collection = await prepareCollection({
                    slug,
                    isSubscriber,
                  })
                  loadedCollections[slug] = collection
                }),
              )

              const loadedNotifiers = await Promise.all(
                storedActivityState.notifiers.map(async (notifier) => {
                  const collection = loadedCollections[
                    notifier.collectionSlug
                  ] as Collection
                  return {
                    ...notifier,
                    id: generateId(),
                    collection,
                    tokenEligibilityMap: await createTokenEligibilityMap({
                      collection,
                      traits: notifier.traits,
                    }),
                  }
                }),
              )

              const newCollections = [
                ...watchedCollections,
                ...collectionsToLoad.map(
                  (slug) => loadedCollections[slug] as Collection,
                ),
              ]
              const newNotifiers = [...notifiers, ...loadedNotifiers]

              setWatchedCollections(newCollections)
              setNotifiers(newNotifiers)

              storeActivityState({
                collections: newCollections,
                notifiers: newNotifiers,
              })
            } catch (e) {
              console.error(e)
              toast({
                duration: 7500,
                position: 'bottom-right',
                render: () => {
                  return (
                    <Toast
                      text="Unable to restore configuration"
                      type="error"
                    />
                  )
                },
              })
            }
          }}
        />
      </Flex>
    </>
  )
}

export default Activity
