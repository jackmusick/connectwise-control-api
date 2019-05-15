const rp = require('request-promise');
const jar = rp.jar();
const _ = require('lodash');

module.exports = function ConnectWiseControl(instanceUrl, username, password) {
    {
        var module = {};
        var headers = null;

        /*
            Get agent download as buffer.
        */
        module.getAgentDownload = async (organization) => {
            await this.getWebSession();

            return await this.getAgentDownload(organization);
        };

        /*
            Gets the entire list of groups from ConnectWise Control.
        */
        module.getSessionGroups = async () => {
            await this.getWebSession();

            return await this.getSessionGroups();
        };

        /*
            Gets the entire list of sessions from ConnectWise Control.
        */
        module.getSessions = async () => {
            await this.getWebSession();

            return await this.getSessions();
        };

        /*
            Often times the session groups are used for clients and it'd be easiest to sort them alphabetically.
        */
        module.sortSessionGroups = async () => {
            await this.getWebSession();

            var groups = await this.getSessionGroups();

            groups = _.orderBy(groups, 'Name', 'asc');

            await this.saveSessionGroups(groups);
        };

        /**
         * @param {string} organization - The new organizations name.
        */

        module.createSessionGroup = async (organization) => {
            await this.getWebSession();

            var groups = await this.getSessionGroups();

            var existingGroups = groups.filter(group => group.Name === organization);

            // Making sure the group doesn't already exist
            if (existingGroups.length === 0) {
                groups.push({
                    Name: organization,
                    SessionFilter: `CustomProperty1='${organization}'`,
                    SessionType: 2,
                    SubgroupExpressions: ''
                });

                // Resorting alphabetically
                groups = _.orderBy(groups, 'Name', 'asc');

                await this.saveSessionGroups(groups);
            } else {
                throw new Error('The session group you specified already exists.');
            }
        };

        /**
         * @param { integer } id - The session group's ID.
         */

        /*
            The actual POST request requires the entire list of sessions. We'll be 
            modifying a single group and sending the entire list back for simplicity.
        */
        module.renameSessionGroup = async (oldName, newName) => {
            await this.getWebSession();

            let groups = await this.getSessionGroups();

            var updatedGroups = groups.map(group => {
                if (group.Name === oldName) {
                    group.Name = newName;
                }
            });

            await this.saveSessionGroups(updatedGroups);
        };

        /**
         * @param {string} organization - The organization you want the agent to be assigned to.
         */
        getAgentDownload = async (organization) => {
            let params = {
                method: 'GET',
                uri: `${instanceUrl}/Services/ExtensionService.ashx/GetInstanceUserInfo`,
                jar,
                json: true
            };

            const instanceInfo = await rp(params); // Gets the instance key

            params.uri = `${instanceUrl}/Services/LicenseService.ashx/GetLicenseInfo`;

            const licenseInfo = await rp(params); // Gets the license ID which helps generate the relay host

            const instanceKey = instanceInfo.publicKey;
            const instance = `instance-${licenseInfo.LicenseRuntimeInfos[0].LicenseID}-relay.screenconnect.com`; // For now.

            // Resetting params for agent download
            params = {
                method: 'GET',
                uri: `${instanceUrl}/Bin/ConnectWiseControl.ClientSetup.msi`,
                qs: {
                    h: instance,
                    p: '443',
                    k: instanceKey,
                    e: 'Access',
                    y: 'Guest',
                    t: '',
                    c: organization
                },
                jar,
                encoding: null,
                resolveWithFullResponse: true
            };

            const res = await rp(params); // Downloading the file

            return res.body; // Should be the buffer of the file
        }

        getSessionGroups = async () => {
            const params = {
                method: 'GET',
                uri: `${instanceUrl}/Services/SessionGroupService.ashx/GetSessionGroups`,
                jar,
                json: true
            };

            const groups = await rp(params);

            return groups;
        }

        getSessions = async () => {
            const params = {
                method: 'GET',
                uri: `${instanceUrl}/Services/PageService.ashx/GetHostSessionInfo`,
                jar,
                body: [2, null, null, null, 3, null],
                json: true
            };

            const res = await rp(params);

            return res.Sessions;
        }

        // /*
        //     Gets a list of computers in the specified session group.
        // */

        // /**
        //  * @param {string} session - 'Session Group'
        // */
        // getHostSessions = async () => {
        //     // Specifiy session and possibly page number to get list of computers. Pick only certain attributes and get the company name.
        // }

        /**
         * @param {group[]} groups - Groups based on getSessionGroups
         */
        saveSessionGroups = async (groups) => {
            let body = [];

            body.push(groups); // For some stupid reason. Control has an array inside of an array.

            // Sending in the entire list with the updated group.
            const params = {
                method: 'POST',
                uri: `${instanceUrl}/Services/SessionGroupService.ashx/SaveSessionGroups`,
                body: body,
                jar,
                json: true
            };

            await rp(params);
        }

        /*
            Signs into the web service and sets the cookie.
        */
        getWebSession = async () => {
            if (!headers) { // Only set to determine if we've already logged in.
                const params = {
                    method: 'POST',
                    uri: `${instanceUrl}/Login?Reason=7`,
                    form: {
                        __VIEWSTATE: '/wEPDwUKLTI1ODYwMDY4Nw8WBB4QQ3VycmVudFZpZXdJbmRleAIBHhNWYWxpZGF0ZVJlcXVlc3RNb2RlAgEWAmYPZBYEAgEPZBYCAgUPFgIeBGhyZWYFSn4vQXBwX1RoZW1lcy9Db3ZpL0RlZmF1bHQuY3NzP19fQ2FjaGU9M2M0NGE1ODctNzM4Zi00ZmRhLWIzNDItMTczZjE5N2U1NGI5ZAIDD2QWAgIBD2QWFAIBDxYCHgdWaXNpYmxlaGQCAw8WAh4JaW5uZXJodG1sBQVMb2dpbmQCBQ8WAh8DaGQCBw8PFgIeBFRleHQFQVlvdSBoYXZlIGJlZW4gbG9nZ2VkIG91dCBvZiB0aGUgc3lzdGVtLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuZGQCCw9kFgICAw8PD2QWAh4MYXV0b2NvbXBsZXRlBQNvZmZlZAINDw8WAh8DaGRkAg8PEA8WAh8DaGRkZGQCEw8PFgIfA2hkZAIVDw8WAh8DaGRkAhsPZBYCZg8WAh4LXyFJdGVtQ291bnQCARYCZg9kFgICAQ8PFgQeD0NvbW1hbmRBcmd1bWVudAUkMWMzODRlYTUtODkwNi00ZTdjLTkxY2UtZmY2MDdlYjE0MmU3HwUFFUNvbm5lY3Qgd2l0aCBPbmVMb2dpbmRkZAixVY/LoiiBjBt/OFzbS8K807qFTvsAkj6ulkeTm9Qn',
                        __VIEWSTATEGENERATOR: '48701E03',
                        ctl00$Main$userNameBox: username,
                        ctl00$Main$passwordBox: password,
                        ctl00$Main$loginButton: 'Login'
                    },
                    jar,
                    resolveWithFullResponse: true,
                    simple: false
                };

                let res = await rp(params);

                // Setting so the rest of the application can use it.
                headers = res.headers;
            }
        };

        return module;
    }
}