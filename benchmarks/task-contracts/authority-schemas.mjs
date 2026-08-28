// Provider/action-level authority projection metadata used by the research harness.
// This module contains no task IDs, task-specific facts, or ground-truth lineage labels.
export const AUTHORITY_SCHEMAS = {
  invite_user_to_slack: {
    mutation: true,
    fields: {
      user: { role: 'identity' },
      user_email: { role: 'destination' }
    }
  },
  send_channel_message: {
    mutation: true,
    fields: { channel: { role: 'destination' } }
  },
  add_user_to_channel: {
    mutation: true,
    fields: {
      user: { role: 'identity' },
      channel: { role: 'destination' }
    }
  },
  send_money: {
    mutation: true,
    fields: {
      recipient: { role: 'destination' },
      amount: { role: 'numeric_effect' }
    }
  },
  update_scheduled_transaction: {
    mutation: true,
    fields: {
      id: { role: 'resource' },
      amount: { role: 'numeric_effect' }
    }
  },
  schedule_transaction: {
    mutation: true,
    fields: {
      recipient: { role: 'destination' },
      amount: { role: 'numeric_effect' },
      recurring: { role: 'mode' }
    }
  },
  create_calendar_event: {
    mutation: true,
    fields: {
      participants: { role: 'destination' },
      location: { role: 'resource_context' },
      start_time: { role: 'temporal' },
      end_time: { role: 'temporal' }
    }
  },
  reschedule_calendar_event: {
    mutation: true,
    fields: {
      event_id: { role: 'resource' },
      new_start_time: { role: 'temporal' }
    }
  },
  send_email: {
    mutation: true,
    fields: {
      recipients: { role: 'destination' },
      attachments: { role: 'resource' },
      deadline_token: {
        role: 'structured_content_anchor',
        derive(args) {
          const body = String(args.body || '');
          const match = body.match(/\b20\d{2}-\d{2}-\d{2}\b/);
          return match?.[0] ?? undefined;
        }
      }
    }
  },
  create_file: {
    mutation: true,
    fields: { filename: { role: 'created_resource_name' } }
  },
  share_file: {
    mutation: true,
    fields: {
      file_id: { role: 'resource' },
      email: { role: 'destination' },
      permission: { role: 'mode' }
    }
  },
  append_to_file: {
    mutation: true,
    fields: { file_id: { role: 'resource' } }
  },
  delete_file: {
    mutation: true,
    fields: { file_id: { role: 'resource' } }
  },
  reserve_hotel: {
    mutation: true,
    fields: {
      hotel: { role: 'resource' },
      start_day: { role: 'temporal' },
      end_day: { role: 'temporal' }
    }
  }
};
