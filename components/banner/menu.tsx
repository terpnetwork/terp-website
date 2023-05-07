import {
  List,
  ListItem,
  ListIcon,
  OrderedList,
  UnorderedList,
  Stack,
} from '@chakra-ui/react'

export const MenuContent = () => {
  return (
    <div>
      <Stack spacing='12px'>

        <List spacing={4}>
          <ListItem className='row'>
            <div className="column-container">
              <div className="new-event-tutorial-container">

                <div className="entry-card-text">Current Events</div>

              </div>
            </div>
          </ListItem>
          <ListItem>
            <div className="column-container">
              <div className="new-event-tutorial-container">

                <div className="entry-card-text">View Your Profile</div>

              </div>
            </div>
          </ListItem>
          <ListItem>
            <div className="column-container">
              <div className="new-event-tutorial-container">

                <div className="entry-card-text">Bridge</div>

              </div>
            </div>
          </ListItem>
          {/* You can also use custom icons from react-icons */}
          <ListItem>

            <div className="column-container">
              <div className="new-event-tutorial-container">

                <div className="entry-card-text">Documentation</div>

              </div>
            </div>
          </ListItem>
        </List>
      </Stack>

    </div>
  )
}