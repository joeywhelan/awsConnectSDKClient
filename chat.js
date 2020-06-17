/*
 * Author: Joey Whelan
 * Desc:  Simple web client for AWS Connect chat.  Direct SDK integration.
 */

class UIHelper {
	static id(id) {
        return document.getElementById(id);
    }

    static empty(element) {
        while (element.hasChildNodes()) {
            element.removeChild(element.lastChild);
        }
    }

    static show(element) {
        const display = element.getAttribute('data-display');
        // Empty string as display restores the default.
        if (display || display === '') {
            element.style.display = display;
        }
    }

    static hide(element) {
        element.setAttribute('data-display', element.style.display);
        element.style.display = 'none';
    }
    
    static displayText(fromUser, text) {
    	const chatLog = UIHelper.id('chatLog');	
    	const msg = fromUser + ' ' + text;
    	chatLog.appendChild(document.createTextNode(msg));
        chatLog.appendChild(document.createElement('br'));
        chatLog.scrollTop = chatLog.scrollHeight - chatLog.offsetHeight;  
    }
} 

class Chat {
	constructor() {
		AWS.config.region = 'us-east-1'; // Region
		AWS.config.credentials = new AWS.Credentials(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY);
		this._reset();
	}

	async disconnect() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
		}

		if (this.chatSocket) {
			this.chatSocket.close();
		}

		if (this.connToken) {
			try {
				const connectPart = new AWS.ConnectParticipant();
				const params = { ConnectionToken: this.connToken };
				await connectPart.disconnectParticipant(params).promise();
			}
			catch (err) {
				//console.log(err);
			}
		}

		this._reset();
	}

	async leave() {
		UIHelper.id('chatLog').innerHTML = '';
		UIHelper.show(UIHelper.id('start'));
		UIHelper.hide(UIHelper.id('started'));
		UIHelper.id('firstName').focus();
		await this.disconnect();
	}
	
	async send() {
		var phrase = UIHelper.id('phrase');
		var text = phrase.value.trim();
		phrase.value = '';

		if (!text || !text.length) {
			return;
		}
		else {
			const connectPart = new AWS.ConnectParticipant();
			const params = {
				ContentType: 'text/plain',
				Content: text,
				ConnectionToken: this.connToken
			};  
			try {
				await connectPart.sendMessage(params).promise();
				UIHelper.displayText(this.firstName + ' ' + this.lastName + ':', text);
			}
			catch(err) {
				console.log(err);
			}
		}
	}

	async start(firstName, lastName) {
		if (!firstName || !lastName) {
			alert('Please enter a first and last name');
			return;
		} 
		else {
			this.firstName = firstName;
			this.lastName = lastName;
			await this._getToken();
			await this._connect();
			UIHelper.displayText('System:', 'Connecting...');
		}
	}

	async _connect() {		
		try {
			const connectPart = new AWS.ConnectParticipant();
			const params = {
				ParticipantToken: this.partToken,
				Type: ['WEBSOCKET', 'CONNECTION_CREDENTIALS']
			};  
			const response = await connectPart.createParticipantConnection(params).promise();
			const diff = Math.abs(new Date() - Date.parse(response.Websocket.ConnectionExpiry));
			this.refreshTimer = setTimeout(this._connect, diff - 5000); //refresh the websocket
			this.connToken = response.ConnectionCredentials.ConnectionToken;
			this._subscribe(response.Websocket.Url);
		}
		catch (err) {
			console.log(err);
		}
	}

	async _getToken() {		
		try {
			const connect = new AWS.Connect();
			const partDetails = {
				DisplayName: this.firstName + ' ' + this.lastName
			}
			const params = {
				ContactFlowId: FLOW_ID,
				InstanceId: INSTANCE_ID,
				ParticipantDetails: partDetails
			};
			const response = await connect.startChatContact(params).promise();
			this.partToken = response.ParticipantToken;
		}
		catch (err) {
			console.error(err)
		}
	}

	_reset() {
		this.firstName = null;
		this.lastName = null;
		this.partToken = null;
		this.refreshTimer = null;
		this.connToken = null;
		this.chatSocket = null;
		this.connected = false;
	}

	_subscribe(url) {	
		this.chatSocket = new WebSocket(url);

		this.chatSocket.onopen = () => {
			const msg = {"topic":"aws/subscribe","content":{"topics":["aws/chat"]}};
			this.chatSocket.send(JSON.stringify(msg));
		};

		this.chatSocket.onmessage = (event) => {
			const msg = JSON.parse(event.data);
			if (msg.topic === 'aws/chat' && msg.contentType === 'application/json') {
				const content = JSON.parse(msg.content);
				switch (content.Type) {
					case 'MESSAGE': 
						if (content.ParticipantRole !== 'CUSTOMER') {
							if (!this.connected) {
								UIHelper.hide(UIHelper.id('start'));
								UIHelper.show(UIHelper.id('started'));
								UIHelper.id('sendButton').disabled = false;
								UIHelper.id('phrase').focus();
								this.connected = true;
							}			
							UIHelper.displayText(content.DisplayName + ':', content.Content);
						}
						break;
					case 'EVENT':
						if (content.ContentType.includes('ended')) {
							UIHelper.id('sendButton').disabled = true;
						}
						break;
				}
			}
		};

		this.chatSocket.onerror = (err) => {
			console.error('WebSocket Error: ' + error);
		};
	}
}

window.addEventListener('DOMContentLoaded', function() {
	const chat = new Chat();
    UIHelper.show(UIHelper.id('start'));
    UIHelper.hide(UIHelper.id('started'));
    UIHelper.id('startButton').onclick = function() {
        chat.start(UIHelper.id('firstName').value, UIHelper.id('lastName').value);
    }.bind(chat);
    UIHelper.id('sendButton').onclick = chat.send.bind(chat);
    UIHelper.id('leaveButton').onclick = chat.leave.bind(chat);
    UIHelper.id('firstName').autocomplete = 'off';
    UIHelper.id('firstName').focus();
    UIHelper.id('lastName').autocomplete = 'off';
    UIHelper.id('phrase').autocomplete = 'off';
    UIHelper.id('phrase').onkeyup = function(e) {
        if (e.keyCode === 13) {
            chat.send();
        }
    }.bind(chat);
        
    window.onunload = function() {
		if (chat) {
			chat.disconnect();
		}
    }.bind(chat); 
});
