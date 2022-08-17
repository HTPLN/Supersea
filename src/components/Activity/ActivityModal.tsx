import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  VStack,
  HStack,
  Heading,
  Box,
  Center,
  IconButton,
  Text,
  Flex,
  Spinner,
  useColorModeValue,
  useToast,
  Button,
  FormControl,
  FormLabel,
  Icon,
  Input,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  useDisclosure,
  Switch,
  Select,
} from '@chakra-ui/react'
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import ActivityEvent, { Event } from './ActivityEvent'
import ScopedCSSPortal from '../ScopedCSSPortal'
import WatchedCollection, { Collection } from './WatchedCollection'
import { AddIcon, SmallAddIcon } from '@chakra-ui/icons'
import Toast from '../Toast'
import {
  fetchCollection,
  fetchCollectionAddress,
  fetchIsRanked,
  fetchRaritiesWithTraits,
} from '../../utils/api'
import { ActivityFilter, PollStatus, Sale } from '../../hooks/useActivity'
import { BiRefresh } from 'react-icons/bi'
import ListingNotifierForm, { Notifier } from './ListingNotifierForm'
import MatchedAssetListing, { MatchedAsset } from './MatchedAssetListing'
import _ from 'lodash'
import { useUser } from '../../utils/user'
import ListingNotifier from './ListingNotifier'
import StateRestore from './StateRestore'
import { StoredActivityState } from '../../utils/extensionConfig'
import ActivityList from './ActivityList'
import {
  getPendingTransactionsForCollection,
  PendingTransaction,
} from '../../hooks/usePendingTransactions'

let sessionHideStateRestore = false

export const prepareCollection = async ({
  slug,
  isSubscriber,
}: {
  slug: string
  isSubscriber: boolean
}) => {
  const collection = await fetchCollection(slug)
  let address = collection.primary_asset_contracts[0]?.address
  if (!address) {
    address =
      (await fetchCollectionAddress(slug, false)) || `MISSING_ADDR:${slug}`
  }

  let rarities: Collection['rarities'] = {
    tokenRank: {},
    noTraitCountTokenRank: {},
    tokenCount: 0,
    isRanked: false,
    traits: [],
  }
  if (address) {
    try {
      if (isSubscriber) {
        const fetchedRarities = await fetchRaritiesWithTraits(address, [])
        if (fetchedRarities) {
          rarities = {
            tokenRank: _.mapValues(
              _.keyBy(fetchedRarities.tokens, 'iteratorID'),
              'rank',
            ),
            noTraitCountTokenRank: _.mapValues(
              _.keyBy(fetchedRarities.tokens, 'iteratorID'),
              'noTraitCountRank',
            ),
            tokenCount: fetchedRarities.tokenCount,
            isRanked: fetchedRarities.tokenCount > 0,
            traits: fetchedRarities.traits,
          }
        }
      } else {
        const isRanked = await fetchIsRanked(address)
        rarities = {
          tokenRank: {},
          noTraitCountTokenRank: {},
          tokenCount: 0,
          isRanked: Boolean(isRanked),
          traits: [],
        }
      }
    } catch (e) {}
  }

  return {
    name: collection.name,
    slug: collection.slug,
    imageUrl: collection.image_url,
    contractAddress: address,
    rarities,
  }
}

const ActivityModal = ({
  events,
  status,
  pollInterval,
  onChangePollInterval,
  collections,
  notifiers,
  matchedAssets,
  onAddCollection,
  onRemoveCollection,
  onAddNotifier,
  onEditNotifier,
  onRemoveNotifier,
  onClearMatches,
  activeCollectionSlug,
  pendingTransactionRecord,
  saleRecord,
  activityFilter,
  onChangeActivityFilter,
  playSound,
  onChangePlaySound,
  sendNotification,
  onChangeSendNotification,
  storedActivityState,
  onDiscardStoredState,
  onRestoreStoredState,
  ...modalProps
}: {
  events: Event[]
  pollInterval: number
  onChangePollInterval: (interval: number) => void
  status: PollStatus
  collections: Collection[]
  notifiers: Notifier[]
  matchedAssets: MatchedAsset[]
  onAddCollection: (collection: Collection) => void
  onRemoveCollection: (collection: Collection) => void
  onAddNotifier: (notifier: Notifier) => void
  onEditNotifier: (notifier: Notifier) => void
  onRemoveNotifier: (notifier: Notifier) => void
  onClearMatches: () => void
  activeCollectionSlug?: string
  pendingTransactionRecord: Record<string, PendingTransaction[]>
  saleRecord: Record<string, Sale>
  activityFilter: ActivityFilter
  onChangeActivityFilter: (filter: ActivityFilter) => void
  playSound: boolean
  onChangePlaySound: (playSound: boolean) => void
  sendNotification: boolean
  onChangeSendNotification: (sendNotification: boolean) => void
  storedActivityState: StoredActivityState | null
  onDiscardStoredState: () => void
  onRestoreStoredState: () => Promise<void>
} & Omit<React.ComponentProps<typeof Modal>, 'children'>) => {
  const [hideStateRestore, setHideStateRestore] = useState(
    sessionHideStateRestore,
  )
  const [loadingCollection, setLoadingCollection] = useState(false)
  const toast = useToast()
  const { isSubscriber } = useUser() || { isSubscriber: false }
  const canAddCollection = Boolean(
    activeCollectionSlug &&
      !collections.find((c) => c.slug === activeCollectionSlug),
  )

  const [editingNotifier, setEditingNotifier] = useState<Notifier | null>(null)

  const [pollIntervalInput, setPollIntervalInput] = useState(
    String(pollInterval),
  )
  const {
    onOpen: onOpenPollIntervalInput,
    onClose: onClosePollIntervalInput,
    isOpen: pollIntervalInputOpen,
  } = useDisclosure()

  const {
    onOpen: onOpenNotifierForm,
    onClose: onCloseNotifierForm,
    isOpen: notifierFormOpen,
  } = useDisclosure()

  useEffect(() => {
    setPollIntervalInput(String(pollInterval))
  }, [pollInterval])

  useEffect(() => {
    const messageListener = (event: MessageEvent) => {
      if (event.data.method === 'SuperSea__Next__routeChangeStart') {
        modalProps.onClose()
      }
    }

    window.addEventListener('message', messageListener)
    return () => {
      window.removeEventListener('message', messageListener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const placeholderBg = useColorModeValue('gray.100', 'blackAlpha.400')
  const warningTextColor = useColorModeValue('orange.700', 'orange.400')
  const borderColor = useColorModeValue('blackAlpha.300', 'whiteAlpha.400')
  const inputBorder = useColorModeValue('blackAlpha.300', 'whiteAlpha.300')

  return (
    <ScopedCSSPortal>
      <Modal {...modalProps} size="6xl">
        <ModalOverlay />
        <ModalContent maxWidth="1340px">
          <ModalCloseButton />
          <ModalBody px="4" pb="0">
            {!hideStateRestore &&
            (storedActivityState?.collections.length ||
              storedActivityState?.notifiers.length) ? (
              <Box mr="8" mb="6" mt="1" maxWidth="900px">
                <StateRestore
                  collections={storedActivityState.collections}
                  notifiers={storedActivityState.notifiers}
                  onDiscard={() => {
                    onDiscardStoredState()
                    sessionHideStateRestore = true
                    setHideStateRestore(true)
                  }}
                  onRestore={async () => {
                    await onRestoreStoredState()
                    sessionHideStateRestore = true
                    setHideStateRestore(true)
                  }}
                />
              </Box>
            ) : null}
            <HStack
              spacing="7"
              mt="3"
              justifyContent="flex-start"
              alignItems="flex-start"
            >
              <Box width="100%">
                <Heading as="h4" size="md" mb="5">
                  Watched Collections
                </Heading>
                <VStack alignItems="flex-start" width="100%" spacing="2">
                  {collections.map((collection) => {
                    return (
                      <WatchedCollection
                        collection={collection}
                        key={collection.slug}
                        pendingTransactions={getPendingTransactionsForCollection(
                          {
                            collectionContractAddress:
                              collection.contractAddress,
                            pendingTransactionRecord,
                            saleRecord,
                          },
                        )}
                        onRemove={() => {
                          onRemoveCollection(collection)
                        }}
                      />
                    )
                  })}
                  <HStack spacing="3" width="100%" px="2">
                    <Center width="48px" height="48px">
                      <IconButton
                        isLoading={loadingCollection}
                        borderRadius="full"
                        icon={<AddIcon />}
                        aria-label="add collection"
                        isDisabled={!canAddCollection}
                        onClick={async () => {
                          if (!activeCollectionSlug) return

                          setLoadingCollection(true)
                          try {
                            onAddCollection(
                              await prepareCollection({
                                slug: activeCollectionSlug,
                                isSubscriber,
                              }),
                            )
                          } catch (e) {
                            console.error(e)
                            toast({
                              duration: 7500,
                              position: 'bottom-right',
                              render: () => {
                                return (
                                  <Toast
                                    text="Unable to load collection"
                                    type="error"
                                  />
                                )
                              },
                            })
                          }
                          setLoadingCollection(false)
                        }}
                      />
                    </Center>
                    <Box opacity={canAddCollection ? 1 : 0.5}>
                      <Text my="0" fontSize="sm" fontWeight="500">
                        {canAddCollection ? (
                          <>
                            Add <em>{activeCollectionSlug}</em>
                          </>
                        ) : (
                          'Navigate to a collection on OpenSea first to add it'
                        )}
                      </Text>
                    </Box>
                  </HStack>
                </VStack>
              </Box>
              <Box
                width="100%"
                display={
                  collections.length === 0 && notifiers.length === 0
                    ? 'none'
                    : 'block'
                }
              >
                <HStack alignItems="center" width="100%" pb="3" spacing="3">
                  <Heading as="h4" size="md">
                    Listing Alerts
                  </Heading>
                  <Button
                    isDisabled={notifierFormOpen}
                    size="sm"
                    leftIcon={<SmallAddIcon />}
                    iconSpacing="1"
                    px="2"
                    onClick={onOpenNotifierForm}
                  >
                    Add
                  </Button>
                </HStack>
                <VStack alignItems="flex-start" width="100%" spacing="4">
                  {notifierFormOpen ? (
                    <ListingNotifierForm
                      isSubscriber={isSubscriber}
                      collections={collections}
                      onCancel={() => {
                        onCloseNotifierForm()
                        setEditingNotifier(null)
                      }}
                      editingNotifier={editingNotifier}
                      onAddNotifier={(notifier) => {
                        if (editingNotifier) {
                          onEditNotifier(notifier)
                        } else {
                          onAddNotifier(notifier)
                        }
                        onCloseNotifierForm()
                        setEditingNotifier(null)
                      }}
                    />
                  ) : null}
                  {!notifierFormOpen && notifiers.length === 0 ? (
                    <Box
                      width="100%"
                      bg={placeholderBg}
                      p="3"
                      borderRadius="md"
                    >
                      <Text opacity="0.75" maxWidth="500px">
                        None yet, add an alert above to get started.
                      </Text>
                    </Box>
                  ) : null}
                  {notifiers.map((notifier) => {
                    return (
                      <ListingNotifier
                        key={notifier.id}
                        notifier={notifier}
                        onRemove={(notifier) => {
                          onRemoveNotifier(notifier)
                        }}
                        onEdit={(notifier) => {
                          setEditingNotifier(notifier)
                          onOpenNotifierForm()
                        }}
                        isActive={collections.some(
                          ({ slug }) => slug === notifier.collection.slug,
                        )}
                      />
                    )
                  })}
                  {notifiers.length > 0 && (
                    <Flex justifyContent="flex-end" width="100%" pt="2">
                      <VStack alignItems="flex-end" spacing="2">
                        <HStack alignItems="center" spacing="2">
                          <Text fontSize="sm" opacity="0.75">
                            Play sound
                          </Text>
                          <Switch
                            isChecked={playSound}
                            onChange={(event) => {
                              onChangePlaySound(event?.target.checked)
                            }}
                          />
                        </HStack>
                        <HStack alignItems="center" spacing="2">
                          <Text fontSize="sm" opacity="0.75">
                            Send Chrome notification
                          </Text>
                          <Switch
                            isChecked={sendNotification}
                            onChange={(event) => {
                              onChangeSendNotification(event?.target.checked)
                            }}
                          />
                        </HStack>
                      </VStack>
                    </Flex>
                  )}
                </VStack>
              </Box>{' '}
            </HStack>
            <HStack
              spacing="5"
              mt="8"
              justifyContent="flex-start"
              alignItems="flex-start"
            >
              <Box
                width="100%"
                display={
                  collections.length === 0 &&
                  events.length === 0 &&
                  matchedAssets.length === 0
                    ? 'none'
                    : 'block'
                }
              >
                <HStack
                  justifyContent="space-between"
                  alignItems="center"
                  mb="3"
                >
                  <Box>
                    <HStack alignItems="center" width="100%" spacing="2">
                      <Heading as="h4" size="md" mb="0">
                        Activity
                      </Heading>
                      <Flex alignItems="center">
                        {(() => {
                          if (status === 'STARTING') {
                            return (
                              <>
                                <Text fontSize="sm" opacity="0.75">
                                  Initializing
                                </Text>
                                <Spinner
                                  size="xs"
                                  ml="0.5em"
                                  opacity="0.75"
                                  mt="1px"
                                />
                              </>
                            )
                          } else if (status === 'RATE_LIMITED') {
                            return (
                              <>
                                <Text
                                  fontSize="sm"
                                  opacity="0.75"
                                  color={warningTextColor}
                                >
                                  Rate limited by OpenSea, cooling down
                                </Text>
                                <Spinner
                                  size="xs"
                                  ml="0.5em"
                                  opacity="0.75"
                                  color={warningTextColor}
                                  mt="1px"
                                />
                              </>
                            )
                          } else if (status === 'ACTIVE') {
                            return (
                              <>
                                <Text
                                  fontSize="sm"
                                  position="relative"
                                  top="2px"
                                >
                                  Checking every{' '}
                                  <Popover
                                    placement="top"
                                    isOpen={pollIntervalInputOpen}
                                    onClose={onClosePollIntervalInput}
                                    onOpen={onOpenPollIntervalInput}
                                  >
                                    <PopoverTrigger>
                                      <Button size="xs">{pollInterval}</Button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      maxW="210px"
                                      borderColor={borderColor}
                                    >
                                      <PopoverArrow />
                                      <PopoverBody>
                                        <FormControl>
                                          <FormLabel>
                                            Poll Interval (Seconds)
                                          </FormLabel>
                                          <HStack spacing="2">
                                            <Input
                                              maxW="100px"
                                              borderColor={inputBorder}
                                              value={pollIntervalInput}
                                              onChange={(e) =>
                                                setPollIntervalInput(
                                                  e.target.value,
                                                )
                                              }
                                            />
                                            <Button
                                              onClick={() => {
                                                onChangePollInterval(
                                                  Number(pollIntervalInput) ||
                                                    pollInterval,
                                                )
                                                onClosePollIntervalInput()
                                              }}
                                            >
                                              Apply
                                            </Button>
                                          </HStack>
                                        </FormControl>
                                      </PopoverBody>
                                    </PopoverContent>
                                  </Popover>{' '}
                                  seconds
                                </Text>
                                <Icon
                                  as={BiRefresh}
                                  width="18px"
                                  height="18px"
                                  ml="0.25em"
                                  mt="1px"
                                  animation="SuperSea__Rotate 4s linear infinite"
                                />
                              </>
                            )
                          } else if (status === 'STREAMING') {
                            return (
                              <>
                                <Text fontSize="sm" mt="3px">
                                  Streaming activity from OpenSea
                                  <Icon
                                    as={BiRefresh}
                                    width="18px"
                                    height="18px"
                                    ml="0.25em"
                                    mt="-1px"
                                    verticalAlign="middle"
                                    animation="SuperSea__Rotate 4s linear infinite"
                                  />
                                </Text>
                              </>
                            )
                          }
                        })()}
                      </Flex>
                    </HStack>
                    <Text fontSize="sm" opacity="0.65" mt="1">
                      Real-time feed of selected activity for the watched
                      collections.
                    </Text>
                  </Box>
                  <Select
                    size="sm"
                    maxWidth="170px"
                    borderColor="transparent"
                    borderRadius="md"
                    bg={useColorModeValue('gray.100', 'whiteAlpha.200')}
                    value={activityFilter}
                    onChange={(e) =>
                      onChangeActivityFilter(e.target.value as ActivityFilter)
                    }
                  >
                    <option value="ALL">Listings &amp; Sales</option>
                    <option value="CREATED">Listings Only</option>
                    <option value="SUCCESSFUL">Sales Only</option>
                    <option value="NONE">Nothing</option>
                  </Select>
                </HStack>
                {activityFilter === 'NONE' ? (
                  <Box width="100%" bg={placeholderBg} p="3" borderRadius="md">
                    <Text opacity="0.75" maxWidth="500px">
                      Activity disabled. Matched listings will still appear to
                      the right, but you won't see the general collection
                      activity here.
                    </Text>
                  </Box>
                ) : (
                  <ActivityList
                    contentKey={`${activityFilter}_${
                      modalProps.isOpen ? 'open' : 'closed'
                    }`}
                    items={events}
                    renderItem={(event) => (
                      <ActivityEvent
                        event={event}
                        pendingTransactions={
                          pendingTransactionRecord[
                            `${event.contractAddress}:${event.tokenId}`
                          ]
                        }
                        sale={
                          saleRecord[
                            `${event.sellerAddress}:${event.contractAddress}:${event.tokenId}`
                          ]
                        }
                      />
                    )}
                  />
                )}
              </Box>
              <Box width="100%">
                {notifiers.length || matchedAssets.length ? (
                  <>
                    <Flex alignItems="center" justifyContent="center">
                      <Heading as="h4" size="md">
                        Matched Listings
                      </Heading>
                      <Icon
                        as={BiRefresh}
                        width="18px"
                        height="18px"
                        ml="2"
                        mt="1px"
                        animation="SuperSea__Rotate 4s linear infinite"
                      ></Icon>
                      <Flex flex="1" justifyContent="flex-end">
                        {matchedAssets.length ? (
                          <Button size="xs" onClick={onClearMatches}>
                            Clear all
                          </Button>
                        ) : null}
                      </Flex>
                    </Flex>
                    <Text fontSize="sm" opacity="0.65" mt="1" mb="3">
                      Listings that match the alerts above.
                    </Text>
                    {matchedAssets.length ? (
                      <ActivityList
                        contentKey={modalProps.isOpen ? 'open' : 'closed'}
                        items={matchedAssets}
                        renderItem={(asset) => (
                          <MatchedAssetListing
                            asset={asset}
                            pendingTransactions={
                              pendingTransactionRecord[
                                `${asset.contractAddress}:${asset.tokenId}`
                              ]
                            }
                            sale={
                              saleRecord[
                                `${asset.sellerAddress}:${asset.contractAddress}:${asset.tokenId}`
                              ]
                            }
                          />
                        )}
                      />
                    ) : (
                      <Box
                        width="100%"
                        bg={placeholderBg}
                        p="3"
                        borderRadius="md"
                      >
                        <Text opacity="0.75" maxWidth="500px">
                          Looking for new listings matching your alert criteria.
                          You can close this modal and browse around on OpenSea
                          while you wait.
                        </Text>
                      </Box>
                    )}
                  </>
                ) : null}
              </Box>
            </HStack>
          </ModalBody>
          <ModalFooter />
        </ModalContent>
      </Modal>
    </ScopedCSSPortal>
  )
}

export default ActivityModal
